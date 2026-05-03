export type CreateBotBody = {
  meeting_url: string;
  bot_name?: string;
  /** Session ilə: Drive-a yükləmə — `false` göndərilməyibsə köhnə davranış olaraq aktiv qala bilər (`!== false`). */
  save_to_drive?: boolean;
  /** Session ilə: S3/Spaces — yalnız `true` olduqda yüklənir. Anonim POST /bots üçün operator Spaces defaults. */
  save_to_spaces?: boolean;
  /** Optional Drive folder id to drop the file into (defaults to the user's Drive root). */
  drive_folder_id?: string;
};

export type MeetJobPayload = {
  meeting_url: string;
  bot_name: string;
  /** Set when the job was created via /me/bots (Google-authenticated user). */
  user_id?: string;
  save_to_drive?: boolean;
  save_to_spaces?: boolean;
  drive_folder_id?: string;
};

export type MeetJobArtifactUrls = {
  /** Standalone M4A when `MEET_ARTIFACT_SEPARATE_AUDIO` + Linux pulse sidecar produced `artifacts/meet-audio.m4a`. */
  audio?: string;
  /** `artifacts/chat_messages.jsonl` */
  chat_messages?: string;
};

export type MeetJobResult = {
  /** Bulud köçürməsindən sonra yerli qovluq silinərsə yox ola bilər. */
  relativePath?: string;
  note?: string;
  /** True when POST /bots/:id/cancel stopped the run; partial WebM may still exist and upload to Spaces. */
  cancelled?: boolean;
  /** Primary video file — backward compatible redirect target for GET /bots/:id/recording */
  spaces_url?: string;
  /** Set when upload was expected but failed (local file still available) */
  spaces_error?: string;
  /** Extra artifact URLs when Spaces upload succeeds (chat, sidecar audio). */
  artifact_urls?: MeetJobArtifactUrls;
  /**
   * Populated only by the API when reading completed jobs from disk (`GET /bots`, `GET /bots/:id`).
   * Not stored in BullMQ returnvalue from the worker.
   */
  chat_messages?: Array<{ t: number; text: string }>;
  /** Video faylının birbaşa baxış linki. */
  drive_url?: string;
  /** Record alt qovluğunun linki. */
  drive_folder_url?: string;
  /** Drive fayl id. */
  drive_file_id?: string;
  /** When Drive upload was attempted and failed; the rest of the job (Spaces, local file) still completes. */
  drive_error?: string;
};
