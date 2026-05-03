import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "../mysql.js";

export type UserRecordFormDefaultsRow = {
  meeting_url: string | null;
  bot_name: string;
  save_to_drive: boolean;
  save_to_spaces: boolean;
  drive_folder_id: string | null;
  updated_at_ms: number;
};

type Row = RowDataPacket & {
  meeting_url: string | null;
  bot_name: string;
  save_to_drive: number;
  save_to_spaces: number;
  drive_folder_id: string | null;
  updated_at_ms: number;
};

export async function getUserRecordFormDefaults(
  userId: string
): Promise<UserRecordFormDefaultsRow | null> {
  const [rows] = await db().query<Row[]>(
    `SELECT meeting_url, bot_name, save_to_drive, save_to_spaces, drive_folder_id, updated_at_ms
     FROM user_record_form_defaults WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    meeting_url: r.meeting_url,
    bot_name: r.bot_name,
    save_to_drive: Boolean(r.save_to_drive),
    save_to_spaces: Boolean(r.save_to_spaces),
    drive_folder_id: r.drive_folder_id,
    updated_at_ms: Number(r.updated_at_ms),
  };
}

export async function upsertUserRecordFormDefaults(
  userId: string,
  input: {
    meeting_url?: string | null;
    bot_name: string;
    save_to_drive: boolean;
    save_to_spaces: boolean;
    drive_folder_id?: string | null;
  }
): Promise<void> {
  const now = Date.now();
  await db().query<ResultSetHeader>(
    `INSERT INTO user_record_form_defaults
       (user_id, meeting_url, bot_name, save_to_drive, save_to_spaces, drive_folder_id, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       meeting_url = VALUES(meeting_url),
       bot_name = VALUES(bot_name),
       save_to_drive = VALUES(save_to_drive),
       save_to_spaces = VALUES(save_to_spaces),
       drive_folder_id = VALUES(drive_folder_id),
       updated_at_ms = VALUES(updated_at_ms)`,
    [
      userId,
      input.meeting_url ?? null,
      input.bot_name.slice(0, 80),
      input.save_to_drive ? 1 : 0,
      input.save_to_spaces ? 1 : 0,
      input.drive_folder_id?.trim() || null,
      now,
    ]
  );
}
