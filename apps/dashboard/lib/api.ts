export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  /** Resolved avatar URL — server prefers self-hosted S3 over Google's CDN. */
  picture?: string;
  /** Self-hosted S3 URL when the avatar has been mirrored to Spaces. */
  avatarUrl?: string;
  /** Original Google `picture` URL (fallback / debugging). */
  googlePictureUrl?: string;
  givenName?: string;
  familyName?: string;
  locale?: string;
  demo?: boolean;
};

export type AuthMe =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false };

export type AuthStatus = { configured: boolean; publicBaseUrl: string; appDemoMode?: boolean };

export type BotResult = {
  /** Yoxdursa, fayl buluda köçürülüb və yerli qovluq silinib ola bilər. */
  relativePath?: string;
  spaces_url?: string;
  spaces_error?: string;
  /** Video faylının baxış linki (Drive) və ya köhnə payload üçün qovluq URL-i. */
  drive_url?: string;
  /** Yalnız qovluq: `Google Drive` kartı üçün. */
  drive_folder_url?: string;
  drive_file_id?: string;
  drive_error?: string;
  cancelled?: boolean;
  note?: string;
  artifact_urls?: { audio?: string; chat_messages?: string };
  chat_messages?: Array<{ t: number; text: string }>;
};

/** Son saxlanmış `/new` form dəyərləri (GET `/me/record-form-defaults`). */
export type RecordFormDefaults = {
  meeting_url: string | null;
  bot_name: string;
  save_to_drive: boolean;
  save_to_spaces: boolean;
  drive_folder_id: string | null;
  updated_at_ms: number;
};

export type BotSnapshot = {
  bot_id: string;
  status: string;
  meeting_url?: string;
  bot_name?: string;
  save_to_drive?: boolean;
  save_to_spaces?: boolean;
  progress_step: string | null;
  times_in_meet: number;
  processing_attempts: number;
  attempts_limit?: number;
  result: BotResult | null;
  failed_reason: string | null;
  queued_at_ms: number;
  processed_on_ms: number | null;
  finished_on_ms: number | null;
};

export type AppConfig = {
  spaces_enabled: boolean;
  spaces_bucket?: string;
  /** True when this user saved per-user S3 credentials (encrypted in MySQL). */
  user_object_storage?: boolean;
};

export type ObjectStorageInfo =
  | { configured: false; save_disabled?: boolean }
  | {
      configured: true;
      endpoint: string;
      region: string;
      bucket: string;
      public_base_url: string;
      access_key_id_masked: string;
      secret_configured: true;
    };

export type ObjectStoragePut = {
  access_key_id?: string;
  secret_access_key?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  public_base_url?: string;
};

export type NotificationKind =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "system";

export type NotificationItem = {
  id: number;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  status: "sent" | "failed" | "info";
  errorMessage: string | null;
  isRead: boolean;
  data: Record<string, unknown> | null;
  botId: string | null;
  createdAtMs: number;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  total: number;
  unread: number;
};

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (hasBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${input}`, { credentials: "include", headers, ...init });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  authStatus: () => request<AuthStatus>("/auth/status"),
  me: () => request<AuthMe>("/auth/me"),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  config: () => request<AppConfig>("/me/config"),
  listBots: (params: { limit?: number; offset?: number } = {}) => {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    return request<{
      total: number;
      total_returned: number;
      limit: number;
      offset: number;
      bots: BotSnapshot[];
    }>(`/me/bots?limit=${limit}&offset=${offset}&include_artifacts=1`);
  },
  getBot: (id: string) => request<BotSnapshot>(`/me/bots/${id}`),
  deleteBot: (id: string) =>
    request<{ ok: boolean; removed?: boolean; status?: string }>(`/me/bots/${id}`, {
      method: "DELETE",
    }),
  bulkDeleteBots: (ids: string[]) =>
    request<{ ok: true; removed: number; skipped_active: number }>("/me/bots/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  createBot: (body: {
    meeting_url: string;
    bot_name?: string;
    save_to_drive: boolean;
    save_to_spaces: boolean;
    drive_folder_id?: string;
  }) => request<{ bot_id: string; status: string }>("/me/bots", { method: "POST", body: JSON.stringify(body) }),
  getRecordFormDefaults: () => request<RecordFormDefaults | null>("/me/record-form-defaults"),
  putRecordFormDefaults: (body: {
    meeting_url?: string | null;
    bot_name: string;
    save_to_drive: boolean;
    save_to_spaces: boolean;
    drive_folder_id?: string | null;
  }) =>
    request<{ ok: true }>("/me/record-form-defaults", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  cancelBot: (id: string) => request<{ ok: boolean }>(`/me/bots/${id}/cancel`, { method: "POST" }),
  registerPushToken: (token: string) =>
    request<{ ok: boolean }>("/me/notifications/token", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  listNotifications: (params: { limit?: number; offset?: number; unreadOnly?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    if (params.unreadOnly) qs.set("unread_only", "1");
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<NotificationListResponse>(`/me/notifications${suffix}`);
  },
  unreadNotifications: () => request<{ count: number }>("/me/notifications/unread-count"),
  markNotificationRead: (id: number) =>
    request<{ ok: boolean }>(`/me/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean; updated: number }>("/me/notifications/read-all", {
      method: "POST",
    }),
  deleteNotification: (id: number) =>
    request<{ ok: boolean }>(`/me/notifications/${id}`, { method: "DELETE" }),
  getObjectStorage: () => request<ObjectStorageInfo>("/me/storage"),
  putObjectStorage: (body: ObjectStoragePut) =>
    request<{ ok: true }>("/me/storage", { method: "PUT", body: JSON.stringify(body) }),
  deleteObjectStorage: () =>
    request<{ ok: true }>("/me/storage", { method: "DELETE" }),
};

export function loginUrl(returnTo: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";
  if (baseUrl) {
    return `${baseUrl}/auth/google/start?return=${encodeURIComponent(returnTo)}`;
  }
  return `/api/auth/google/start?return=${encodeURIComponent(returnTo)}`;
}

/** Fired by NotificationBell after the realtime stream tells us a new feed
 *  item arrived. Components can listen and refetch their lists. */
export const NOTIFICATIONS_CHANGED_EVENT = "meet-bot:notifications-changed";
