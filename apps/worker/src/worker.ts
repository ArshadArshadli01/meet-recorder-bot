import "dotenv/config";
import "./process-unbuffer.js";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { Worker } from "bullmq";
import { buildInfoLogLine } from "./build-info.js";
import { config, recordingsRoot, type SpacesConfig } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { clearJobCancel, isJobCancelRequested } from "./job-cancel.js";
import { markTimesInMeet } from "./meet-metrics.js";
import { LINUX_DESKTOP_MP4 } from "./ffmpeg-linux-desktop-capture.js";
import { muxWebmWithSidecarAudioIfPresent } from "./ffmpeg-mux.js";
import { startParallelAudioCapture } from "./parallel-audio-capture.js";
import { collectArtifactPaths } from "./meet-artifacts.js";
import {
  mimeTypeForRecording,
  resolveDriveFolderIdOrName,
  uploadFileToUserDrive,
} from "./drive-upload.js";
import { runMeetRecording } from "./meet-session.js";
import { connection } from "./queue.js";
import { getJobOwner } from "./auth/user-store.js";
import { getUserSpacesConfig } from "./db/models/user-object-storage.js";
import { REALTIME_CHANNEL, type JobRealtimeEvent } from "./realtime-events.js";
import {
  buildRecordingBaseName,
  extensionFromPath,
} from "./recording-names.js";
import { buildRecordingObjectKey, uploadToSpaces } from "./spaces-upload.js";
import type {
  MeetJobArtifactUrls,
  MeetJobPayload,
  MeetJobResult,
} from "./types.js";
import { workerErr, workerLog } from "./worker-log.js";
import { sendUserNotification } from "./notifications/fcm.js";

/** API `local-recording-purge.ts` ilə eyni açar — sinxron saxlayın. */
const LOCAL_RECORDING_PURGE_ZSET = "meet-bot:local-recording-purge";

async function scheduleLocalOnlyRecordingExpiry(botId: string): Promise<void> {
  try {
    await connection.zadd(
      LOCAL_RECORDING_PURGE_ZSET,
      Date.now() + 15 * 60 * 1000,
      botId
    );
  } catch {
    /* ignore */
  }
}

async function cancelScheduledLocalRecordingExpiry(botId: string): Promise<void> {
  try {
    await connection.zrem(LOCAL_RECORDING_PURGE_ZSET, botId);
  } catch {
    /* ignore */
  }
}

workerLog(buildInfoLogLine("worker"));
workerLog(
  `[meet-bot-worker] node pid=${process.pid} boot ${new Date().toISOString()} queue="${config.queueName}"`
);

void runMigrations()
  .then((res) => {
    if (res.appliedNow.length > 0) {
      workerLog(`[worker] applied migrations: ${res.appliedNow.join(", ")}`);
    }
  })
  .catch((err) => {
    workerErr(`[worker] migration check failed: ${String(err)}`);
  });

connection.on("error", (err) => {
  workerErr(`[redis connection] ${String(err)}`);
});

async function publishRealtime(evt: JobRealtimeEvent): Promise<void> {
  try {
    await connection.publish(REALTIME_CHANNEL, JSON.stringify(evt));
  } catch (err) {
    workerErr(`[realtime publish] ${String(err)}`);
  }
}

const worker = new Worker<MeetJobPayload, MeetJobResult>(
  config.queueName,
  async (job) => {
    const botId = String(job.id);
    workerLog(`[job ${botId}] started`);
    if (await isJobCancelRequested(connection, botId)) {
      workerLog(`[job ${botId}] cancel flag set before run — failing fast`);
      throw new Error("Recording cancelled via API");
    }
    const outDir = join(recordingsRoot(), botId);
    await mkdir(outDir, { recursive: true });
    /** Qoşulma vaxtına yaxın — Drive/S3 fayl adı üçün (Bakı vaxtı + Meet kodu + bot_id). */
    const recordingStartedMs = job.processedOn ?? Date.now();
    const ownerUserId = job.data.user_id ?? (await getJobOwner(connection, botId)) ?? undefined;

    const wantsSpaces = ownerUserId ? job.data.save_to_spaces === true : true;
    const wantsDrive = Boolean(ownerUserId && job.data.save_to_drive !== false);

    const linuxX11Desktop =
      process.platform === "linux" && config.meetLinuxRecordMode === "x11";

    let stopParallelAudio: (() => Promise<void>) | undefined;
    try {
      if (!linuxX11Desktop) {
        const audioStop = await startParallelAudioCapture(outDir, workerLog, workerErr);
        stopParallelAudio = audioStop ?? undefined;
      }

      let timesInMeetFlag = 0;
      const session = await runMeetRecording({
        meetingUrl: job.data.meeting_url,
        botName: job.data.bot_name,
        outDir,
        isCancelled: async () => {
          const stop = await isJobCancelRequested(connection, botId);
          if (stop) {
            job.updateProgress({ step: "cancelling", times_in_meet: timesInMeetFlag }).catch(() => {});
          }
          return stop;
        },
        onStatus: (step) => {
          workerLog(`[job ${botId}] ${step}`);
          if (
            timesInMeetFlag === 0 &&
            /^(in_lobby_or_call|meet_in_call_leave_button|recording)$/.test(step)
          ) {
            timesInMeetFlag = 1;
            void markTimesInMeet(connection, botId);
          }
          job
            .updateProgress({ step, times_in_meet: timesInMeetFlag })
            .catch(() => {});
          if (ownerUserId) {
            void publishRealtime({
              kind: "progress",
              userId: ownerUserId,
              botId,
              step,
              timesInMeet: timesInMeetFlag,
              t: Date.now(),
            });
          }
        },
      });

      await stopParallelAudio?.();
      stopParallelAudio = undefined;

      let videoPath = session.videoAbsolutePath;
      let muxSuffix = "";
      if (session.cancelled) {
        job.updateProgress({ step: "cancelled" }).catch(() => {});
        workerLog(
          `[job ${botId}] cancellation acknowledged — continuing to mux/upload when Drive or Spaces is configured`
        );
      }
      const hasDesktopMp4 =
        basename(videoPath) === LINUX_DESKTOP_MP4 ||
        videoPath.endsWith(LINUX_DESKTOP_MP4);
      if (config.meetAudioMux && !hasDesktopMp4) {
        const wavProbe = join(outDir, "meet-audio.wav");
        const hadWav =
          existsSync(wavProbe) && statSync(wavProbe).size > 1500;
        const muxed = await muxWebmWithSidecarAudioIfPresent(videoPath, outDir);
        if (muxed) {
          videoPath = muxed;
          muxSuffix =
            " Muxed video+audio to MP4 (parallel ffmpeg capture + MEET_AUDIO_MUX).";
          workerLog(`[job ${botId}] audio mux -> ${muxed}`);
        } else if (!hadWav) {
          workerLog(
            `[job ${botId}] audio mux skipped — no meet-audio.wav (Playwright WebM has no sound; enable MEET_CAPTURE_AUDIO and fix Windows WASAPI / loopback).`
          );
        } else {
          workerErr(
            `[job ${botId}] audio mux failed — meet-audio.wav present but ffmpeg mux errored (see [ffmpeg-mux] stderr above).`
          );
        }
      } else if (config.meetAudioMux && hasDesktopMp4) {
        const pm = session.x11DesktopPulseMuxed;
        const audio = session.audioCaptured;
        if (pm === false) {
          workerErr(
            `[job ${botId}] ${LINUX_DESKTOP_MP4} has no meeting audio — ffmpeg fell back to x11grab-only. Fix: use system /usr/bin/ffmpeg (not npm ffmpeg-static): set MEET_FFMPEG_PATH=/usr/bin/ffmpeg or rebuild; logs show [ffmpeg-desktop] pulse input not supported.`
          );
          if (!session.cancelled) {
            throw new Error(
              "Recording produced no audio packets (ffmpeg fell back to x11-only — pulse demuxer missing). Failing job per fail-loud policy."
            );
          }
        } else if (pm === true) {
          if (audio === false && !session.cancelled) {
            workerErr(
              `[job ${botId}] ${LINUX_DESKTOP_MP4} ran x11grab+pulse but ffmpeg never received audio packets — Pulse routing is broken (sink=meet_bot_sink default? PULSE_SINK exported?). See docker-worker.sh logs for module-null-sink load result.`
            );
            throw new Error(
              "Recording produced no audio packets (ffmpeg ran with pulse demuxer but no audio data flowed through meet_bot_sink.monitor). Failing job per fail-loud policy."
            );
          }
          workerLog(
            `[job ${botId}] audio already in ${LINUX_DESKTOP_MP4} (x11grab+pulse${audio ? ", packets verified" : audio === false ? ", no packets — cancelled run" : ""}) — skipping WebM+WAV mux.`
          );
        } else {
          workerLog(
            `[job ${botId}] ${LINUX_DESKTOP_MP4} — skipping WebM mux (desktop MP4 path; upgrade worker for pulse mux telemetry).`
          );
        }
      }

      const rel = relative(config.dataDir, videoPath).replace(/\\/g, "/");
      const noteParts = [session.note, muxSuffix.trim()];
      if (session.cancelled) noteParts.push("Cancelled by user request.");
      const out: MeetJobResult = {
        relativePath: rel,
        note: noteParts.filter(Boolean).join(" ") || undefined,
        cancelled: session.cancelled,
      };

      workerLog(
        `[job ${botId}] upload_plan owner=${ownerUserId ?? "none"} drive=${wantsDrive} spaces=${wantsSpaces}`
      );

      const artifacts = await collectArtifactPaths(outDir);
      const wantsArtifactSpaces = wantsSpaces || wantsDrive;

      let resolvedSpaces: SpacesConfig | null = null;
      if (ownerUserId) {
        resolvedSpaces = await getUserSpacesConfig(ownerUserId);
      }
      if (!resolvedSpaces) {
        resolvedSpaces = config.spaces ?? null;
      }

      let resolvedParentFolderId: string | undefined;
      if (
        ownerUserId &&
        (wantsDrive || wantsSpaces) &&
        job.data.drive_folder_id?.trim()
      ) {
        resolvedParentFolderId = await resolveDriveFolderIdOrName({
          redis: connection,
          userId: ownerUserId,
          folderIdOrName: job.data.drive_folder_id,
        });
      }

      const recordingBase = buildRecordingBaseName(
        recordingStartedMs,
        job.data.meeting_url,
        botId
      );
      const spacesFolderSeg = resolvedParentFolderId ?? botId;
      const spacesJobPrefix = `meet-recordings/${spacesFolderSeg}`;

      if (resolvedSpaces && wantsSpaces) {
        const videoPublicName = `${recordingBase}${extensionFromPath(videoPath)}`;
        const key = `${spacesJobPrefix}/${videoPublicName}`;
        try {
          out.spaces_url = await uploadToSpaces(
            resolvedSpaces,
            videoPath,
            key
          );
          job
            .updateProgress({ step: "uploaded_to_spaces" })
            .catch(() => {});
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          out.spaces_error = msg;
          workerErr(`Spaces upload failed ${String(e)}`);
        }

        /** Re-read disk after the browser closes — upload chat JSONL / sidecar audio when present (S3-compatible Spaces API). */
        const hasNested =
          Boolean(artifacts.chatJsonl) ||
          Boolean(artifacts.sidecarAudioM4a);

        if (hasNested) {
          const urls: MeetJobArtifactUrls = {};

          const uploadNested = async (
            abs: string | undefined,
            label: string
          ): Promise<string | undefined> => {
            if (!abs || !existsSync(abs) || statSync(abs).size < 2) return undefined;
            const nestedKey = buildRecordingObjectKey(
              spacesJobPrefix,
              relative(outDir, abs).replace(/\\/g, "/")
            );
            try {
              const url = await uploadToSpaces(resolvedSpaces!, abs, nestedKey);
              workerLog(`[job ${botId}] uploaded artifact ${label} → ${nestedKey}`);
              return url;
            } catch (e) {
              workerErr(`[job ${botId}] artifact upload failed (${label}): ${String(e)}`);
              return undefined;
            }
          };

          const au = await uploadNested(artifacts.sidecarAudioM4a, "audio");
          if (au) urls.audio = au;
          const ch = await uploadNested(artifacts.chatJsonl, "chat_messages");
          if (ch) urls.chat_messages = ch;

          if (Object.keys(urls).length > 0) {
            out.artifact_urls = urls;
            job
              .updateProgress({ step: "uploaded_artifacts_to_spaces" })
              .catch(() => {});
          } else {
            workerLog(
              `[job ${botId}] artifact paths on disk but none uploaded (empty chat file?)`
            );
          }
        }
      }

      if (resolvedSpaces && wantsArtifactSpaces && !out.artifact_urls) {
        const hasNested =
          Boolean(artifacts.chatJsonl) ||
          Boolean(artifacts.sidecarAudioM4a);
        if (hasNested) {
          const urls: MeetJobArtifactUrls = {};
          const uploadNested = async (abs: string | undefined, label: string): Promise<string | undefined> => {
            if (!abs || !existsSync(abs) || statSync(abs).size < 2) return undefined;
            const nestedKey = buildRecordingObjectKey(
              spacesJobPrefix,
              relative(outDir, abs).replace(/\\/g, "/")
            );
            try {
              const url = await uploadToSpaces(resolvedSpaces!, abs, nestedKey);
              workerLog(`[job ${botId}] uploaded artifact ${label} → ${nestedKey}`);
              return url;
            } catch (e) {
              workerErr(`[job ${botId}] artifact upload failed (${label}): ${String(e)}`);
              return undefined;
            }
          };
          const au = await uploadNested(artifacts.sidecarAudioM4a, "audio");
          if (au) urls.audio = au;
          const ch = await uploadNested(artifacts.chatJsonl, "chat_messages");
          if (ch) urls.chat_messages = ch;
          if (Object.keys(urls).length > 0) {
            out.artifact_urls = urls;
            job.updateProgress({ step: "uploaded_artifacts_to_spaces" }).catch(() => {});
          }
        }
      }

      if (wantsSpaces && !resolvedSpaces) {
        out.spaces_error =
          "Object storage is not configured — add S3 credentials under Settings or set DO_SPACES_* on the server.";
        workerErr(`[job ${botId}] Spaces upload skipped — no operator or per-user S3 config`);
      }

      if (wantsDrive && ownerUserId) {
        job.updateProgress({ step: "uploading_to_drive" }).catch(() => {});
        try {
          const videoPublicName = `${recordingBase}${extensionFromPath(videoPath)}`;
          const upload = await uploadFileToUserDrive({
            redis: connection,
            userId: ownerUserId,
            filePath: videoPath,
            driveName: videoPublicName,
            parentFolderId: resolvedParentFolderId,
            mimeType: mimeTypeForRecording(videoPath),
          });
          if (artifacts.sidecarAudioM4a && existsSync(artifacts.sidecarAudioM4a)) {
            const sideName = `${recordingBase}-audio${extensionFromPath(artifacts.sidecarAudioM4a)}`;
            await uploadFileToUserDrive({
              redis: connection,
              userId: ownerUserId,
              filePath: artifacts.sidecarAudioM4a,
              driveName: sideName,
              parentFolderId: resolvedParentFolderId,
              mimeType: mimeTypeForRecording(artifacts.sidecarAudioM4a),
            });
          }
          out.drive_file_id = upload.fileId;
          out.drive_url = upload.webViewLink;
          if (resolvedParentFolderId) {
            out.drive_folder_url = `https://drive.google.com/drive/folders/${resolvedParentFolderId}`;
          }
          workerLog(
            `[job ${botId}] uploaded Drive video=${upload.fileId} folder=${resolvedParentFolderId ?? "root"}`
          );
          job.updateProgress({ step: "uploaded_to_drive" }).catch(() => {});
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          out.drive_error = msg;
          workerErr(`[job ${botId}] Drive upload failed: ${msg}`);
        }
      }

      const driveRequested = wantsDrive;
      const spacesRequested = wantsSpaces;
      const driveOk = !driveRequested || Boolean(out.drive_file_id);
      const spacesOk = !spacesRequested || Boolean(out.spaces_url);
      const shouldRemoveLocalAfterCloud =
        (driveRequested || spacesRequested) && driveOk && spacesOk;

      if (shouldRemoveLocalAfterCloud) {
        try {
          await cancelScheduledLocalRecordingExpiry(botId);
          await rm(outDir, { recursive: true, force: true });
          workerLog(
            `[job ${botId}] removed local recording directory after cloud upload`
          );
          delete out.relativePath;
        } catch (e) {
          workerErr(
            `[job ${botId}] could not remove local recording directory: ${String(e)}`
          );
        }
      }

      if (ownerUserId && !wantsDrive && !wantsSpaces && out.relativePath) {
        void scheduleLocalOnlyRecordingExpiry(botId);
      }

      return out;
    } finally {
      await stopParallelAudio?.();
      await clearJobCancel(connection, botId).catch(() => {});
    }
  },
  {
    connection,
    concurrency: config.workerConcurrency,
    lockDuration: config.bullmqLockDurationMs,
    stalledInterval: config.bullmqStalledIntervalMs,
    maxStalledCount: config.bullmqMaxStalledCount,
  }
);

worker.on("ready", () => {
  workerLog(
    `[worker] BullMQ ready — consuming "${config.queueName}" (dashboard uses POST /me/bots; legacy API: POST /bots)`
  );
});

worker.on("active", (job) => {
  workerLog(`[worker] active job ${job.id}`);
  const userId = job.data?.user_id;
  if (userId) {
    const botId = String(job.id);
    void publishRealtime({
      kind: "state",
      userId,
      botId,
      state: "active",
      t: Date.now(),
    });
    void sendUserNotification({
      userId,
      kind: "started",
      title: "Record başladı",
      body: `${job.data?.bot_name || "Meet Bot"} görüşə qoşulur.`,
      data: { botId, status: "started" },
    });
  }
});

worker.on("error", (err) => {
  workerErr(`[worker] BullMQ worker error: ${String(err)}`);
});

worker.on("failed", (job, err) => {
  workerErr(`Job ${job?.id} failed ${String(err)}`);
  const userId = job?.data?.user_id;
  if (job?.id && userId) {
    void publishRealtime({
      kind: "failed",
      userId,
      botId: String(job.id),
      reason: err?.message ?? String(err),
      t: Date.now(),
    });
    void sendUserNotification({
      userId,
      kind: "failed",
      title: "Record uğursuz oldu",
      body: `${job?.data?.bot_name || "Meet Bot"}: ${err?.message ?? "naməlum xəta"}`,
      data: { botId: String(job.id), status: "failed" },
    });
  }
});

worker.on("completed", (job) => {
  workerLog(`Job ${job.id} completed ${JSON.stringify(job.returnvalue)}`);
  const userId = job.data?.user_id;
  const rv = job.returnvalue as MeetJobResult | undefined;
  const cancelled = Boolean(rv?.cancelled);
  if (userId) {
    void publishRealtime({
      kind: "completed",
      userId,
      botId: String(job.id),
      result: job.returnvalue as MeetJobResult,
      t: Date.now(),
    });
    void sendUserNotification({
      userId,
      kind: "completed",
      title: cancelled ? "Görüş dayandırıldı" : "Record hazırdır",
      body: cancelled
        ? `${job.data?.bot_name || "Meet Bot"}: görüşdə record dayandırıldı. Fayl yüklənibsə, paneldə əlavə linklər görünəcək.`
        : `${job.data?.bot_name || "Meet Bot"} recordu tamamlandı və yüklənməyə hazırdır.`,
      data: {
        botId: String(job.id),
        status: cancelled ? "stopped" : "completed",
      },
    });
  }
});

worker.on("stalled", (jobId) => {
  workerErr(`[worker] job stalled (recovering): ${jobId}`);
});

function idleHeartbeat(): void {
  workerLog(
    `[meet-bot-worker] idle heartbeat ${new Date().toISOString()} — waiting for Redis jobs (dashboard POST /me/bots or legacy POST /bots)`
  );
}
setInterval(idleHeartbeat, 120_000);
setTimeout(idleHeartbeat, 4000);

async function stop(): Promise<void> {
  await worker.close();
  await connection.quit();
}

process.on("SIGTERM", () => {
  void stop().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void stop().then(() => process.exit(0));
});
