import type { BotResult } from "./api";

/** Record ən azı bir bulud mənbəyinə (Spaces / Drive) yazılıbsa və ya Drive fayl ID-si varsa. */
export function hasBotCloudArtifact(result: BotResult | null | undefined): boolean {
  if (!result) return false;
  return Boolean(result.spaces_url || result.drive_url || result.drive_file_id);
}

const fullDateTime = new Intl.DateTimeFormat("az-AZ", {
  timeZone: "Asia/Baku",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBakuDateTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return fullDateTime.format(new Date(ms));
}

export function formatStatusAz(status: string): string {
  const v = status.toLowerCase();
  if (v === "waiting") return "Növbədə";
  if (v === "queued") return "Növbəyə alınıb";
  if (v === "active") return "Aktiv";
  if (v === "processing") return "Emal olunur";
  if (v === "completed") return "Tamamlandı";
  if (v === "failed") return "Uğursuz";
  if (v === "delayed") return "Gecikmiş";
  if (v === "paused") return "Dayandırılıb";
  if (v === "prioritized") return "Prioritet";
  return status;
}

/**
 * Badge / card üçün: BullMQ `completed` olsa belə, istifadəçi recordu dayandırdısa
 * (`result.cancelled`) “ləğv” deyil — görüşün dayandırılması kimi göstərilir.
 */
export function formatBotStatusBadgeAz(status: string, result?: BotResult | null): string {
  const s = status.toLowerCase();
  if (s === "completed" && result?.cancelled) {
    if (hasBotCloudArtifact(result)) {
      return "Tamamlandı";
    }
    return "Görüş dayandırıldı";
  }
  if (s === "completed" && result && !result.cancelled) {
    return "Record uğurla saxlanıldı";
  }
  return formatStatusAz(status);
}

/** Siyahı və detal alt başlığı üçün qısa mətn. */
export function formatBotSummaryLineAz(input: {
  status: string;
  progress_step: string | null;
  result: BotResult | null;
  failed_reason: string | null;
}): string {
  const s = input.status.toLowerCase();
  if (s === "completed" && input.result?.cancelled) {
    return hasBotCloudArtifact(input.result)
      ? "Tamamlandı — record buluda saxlanıldı"
      : "Görüş dayandırıldı";
  }
  if (s === "completed" && input.result && !input.result.cancelled) {
    return "Record uğurla saxlanıldı";
  }
  if (s === "failed") {
    return input.failed_reason ? `Uğursuz: ${input.failed_reason}` : "Uğursuz";
  }
  return formatProgressStepAz(input.progress_step);
}

/** Worker `onStatus` / BullMQ `progress.step` — texniki kodları istifadəçi üçün azərbaycanlı mətnə çevirir. */
export function formatProgressStepAz(step: string | null | undefined): string {
  if (!step) return "Hazırlanır";

  const raw = step.trim();
  const v = raw.toLowerCase();

  const rec = translateDynamicProgressStep(raw, v);
  if (rec) return rec;

  const exact: Record<string, string> = {
    joining_meet: "Görüşə qoşulur",
    recording: "Record aparılır",
    processing_recording: "Record emal olunur",
    uploading_to_drive: "Google Drive-a yüklənir",
    uploaded_to_drive: "Google Drive-a yükləndi",
    uploading_to_spaces: "Bulud saxlama (S3 / Spaces)-a yüklənir",
    uploaded_to_spaces: "Bulud saxlamağa yükləndi",
    uploaded_artifacts_to_spaces: "Çat və şəkillər yükləndi",
    cancelled: "Görüş dayandırıldı",
    cancelling: "Dayandırılır…",
    cancellation_requested: "Dayandırma sorğusu gözlənilir",
    cancelled_flushing_video: "Video sonlandırılır",
    cancelled_waiting_desktop_flush: "Desktop yazığı tamamlanır",
    closing_browser: "Brauzer bağlanır",
    in_lobby_or_call: "Lobbidə və ya zəngdə",
    meet_in_call_leave_button: "Görüşdə",
    meet_in_call_ui: "Görüş interfeysində",
    meet_pointer_warmup: "Siçan göstəricisi hazırlanır",
    launching_browser: "Brauzer başladılır",
    launch_stealth_chromium: "Stealth Chromium işə düşür",
    join_flow_started: "Qoşulma başladı",
    join_flow_after_signin_check: "Giriş vəziyyəti yoxlanır",
    join_flow_before_name: "Ad daxil etmədən əvvəl",
    opening_meet: "Meet səhifəsi açılır",
    click_join_as_guest: "Qonaq kimi davam edilir",
    continue_without_media: "Kamera/mikrofonsuz davam edilir",
    dismiss_meet_hardware_toast: "Avadanlıq xəbərdarlığı bağlanır",
    dismiss_cookie_banner: "Çerez bildirişi bağlanır",
    dismiss_meet_info_popup: "Məlumat pəncərəsi bağlanır",
    dismiss_meet_info_popup_role: "Məlumat dialoqu bağlanır",
    fill_guest_name_meetingbot_aria: "Ad sahəsi doldurulur",
    fill_guest_name_contenteditable: "Ad mətn sahəsində yazılır",
    fill_guest_name_dom_fallback: "Ad alternativ üsulla yazılır",
    join_click_meetingbot_race: "«Qoşul indi» / «Qoşulmaq üçün sor» axtarılır",
    click_join_meetingbot_race_ok: "Qoşul düyməsinə toxunuldu",
    join_button_disabled_check_name_field: "Ad düzgün yazılıbmı yoxlayın (qoşul hələ aktiv deyil)",
    click_join_meetingbot_span_button: "Qoşul düyməsinə toxunuldu",
    click_join_real_button: "Qoşul düyməsinə toxunuldu",
    meet_waiting_room_visible_host_should_see_knock:
      "Gözləmə otağı — təşkilatçı qəbul gözləyir",
    meet_post_join_timeout_check_recording: "Qoşulmadan sonra interfeys yoxlanır",
    recording_ui_hide_controls_css: "Görüş alt paneli gizlədilir",
    recording_ui_xdotool_f11: "Tam ekran rejimi (F11)",
    recording_ui_xdotool_f11_skipped: "Tam ekran keçirildi (bu mühitdə F11 yoxdur)",
    recording_x11_desktop_ffmpeg_started: "Desktop yazığı başladı (ffmpeg)",
    recording_pulse_sidecar_started: "Əlavə audio yazığı başladı",
    recording_x11_desktop_ffmpeg_stopping: "Desktop yazığı saxlanılır…",
    recording_pulse_sidecar_stopping: "Əlavə audio saxlanılır…",
    recording_x11_desktop_audio_flow_ok: "Desktop yazığında səs axını təsdiqləndi",
    recording_x11_desktop_audio_flow_missing: "Desktop yazığında meeting səsi tapılmadı",
    meeting_ui_left_or_ended: "Görüş bitdi və ya siz çıxdınız",
    meeting_ui_leave_control_gone_end_detected: "Görüşün sonu aşkarlandı",
    prejoin_mute_mic: "Öncə mikrofon söndürülür",
    prejoin_camera_off: "Öncə kamera söndürülür",
    incall_mute_mic: "Mikrofon söndürülür",
    incall_camera_off: "Kamera söndürülür",
  };

  const keyUnderscore = v.replace(/\s+/g, "_");
  if (exact[keyUnderscore]) return exact[keyUnderscore];
  if (exact[v]) return exact[v];

  const framePress = /^fill_guest_name_frame_(\d+)_pressseq$/.exec(keyUnderscore);
  if (framePress) {
    return `Ad yazılır (iframe ${Number(framePress[1]) + 1})`;
  }

  const genericGuest = /^fill_guest_name_(.+)$/.exec(keyUnderscore);
  if (genericGuest) {
    return `Ad sahəsi doldurulur (${guestNameTagAz(genericGuest[1])})`;
  }

  return prettifyUnknownProgressStep(raw);
}

function guestNameTagAz(tag: string): string {
  const map: Record<string, string> = {
    aria_label_your_name_repeat: "aria — ad",
    textbox_role: "mətn qutusu",
    placeholder_exact: "placeholder",
    placeholder: "placeholder üzrə",
    placeholder_attr: "placeholder atributu",
    placeholder_star: "placeholder *",
    aria_label: "aria etiketi",
    input_text: "mətn input",
    meetingbot_aria: "Meet standart sahəsi",
  };
  return map[tag] ?? tag.replaceAll("_", " ");
}

/** Dinamik və ya köçürülməmiş məzmun (HTTP kodu, ffmpeg loqu və s.). */
function translateDynamicProgressStep(raw: string, v: string): string | null {
  const nav = /^navigating_to_meet_wait_(.+)$/.exec(v);
  if (nav) {
    const mode = nav[1];
    const modeAz =
      mode === "load"
        ? "səhifə yüklənənə qədər"
        : mode === "domcontentloaded"
          ? "DOM hazır olana qədər"
          : mode === "networkidle"
            ? "şəbəkə sakitləşənə qədər"
            : mode.replaceAll("_", " ");
    return `Meet ünvanına keçid (${modeAz})`;
  }

  const http = /^meet_http_(\d+)_after_(\d+)ms$/.exec(v);
  if (http) return `Meet cavabı: HTTP ${http[1]} (${http[2]} ms sonra)`;

  const title = /^meet_dom_ready_title:(.+)$/i.exec(raw);
  if (title) return `Meet səhifəsi hazır — başlıq: ${title[1].slice(0, 80)}`;

  const chatLines = /^artifact_chat_lines_(\d+)$/.exec(v);
  if (chatLines) return `Çat mətnləri toplanır (${chatLines[1]} sətir)`;

  if (/^\[recording\]/i.test(raw)) return translateRecordingLogLine(raw);

  if (v.includes("ffmpeg-desktop") || v.includes("[ffmpeg-desktop]"))
    return "Desktop yazığı (ffmpeg) — texniki məruzə";

  return null;
}

function translateRecordingLogLine(raw: string): string {
  const inner = raw.replace(/^\[recording\]\s*/i, "");
  if (/x11grab\+pulse/i.test(inner))
    return "Desktop yazığı işləyir — video və səs (ffmpeg)";
  if (/x11grab only/i.test(inner) || /no audio/i.test(inner))
    return "Desktop yazığı işləyir — yalnız video (səs və ya Pulse əlçatmaz)";
  if (/ffmpeg/i.test(inner)) return "Desktop yazığı (ffmpeg) işləyir";
  return "Record prosesi";
}

/** Tanınmayan addım: mötərizə/tire ilə təmiz oxunuşlu mətn. */
function prettifyUnknownProgressStep(raw: string): string {
  let s = raw.replaceAll("_", " ").trim();
  s = s.replace(/\s+/g, " ");
  if (s.length > 96) return `${s.slice(0, 93)}…`;
  return s.length > 0 ? s : "Hazırlanır";
}
