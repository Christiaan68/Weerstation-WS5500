import { sql } from "drizzle-orm";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

/** Explicit scope: only weather application tables in the current database. */
export const WEATHER_STORAGE_TABLES = [
  "raw_weather_packets",
  "weather_observations",
  "sensor_measurements",
  "daily_weather_summary",
  "monthly_weather_summary",
  "yearly_weather_summary",
  "weather_provider_state",
  "stations",
  "app_settings",
] as const;

type StorageTable = (typeof WEATHER_STORAGE_TABLES)[number];
export interface StorageComponent {
  table: StorageTable;
  bytes: number;
}
export type DatabaseStorage =
  | {
      status: "ok";
      components: StorageComponent[];
      totalBytes: number;
      missingTables: string[];
    }
  | { status: "empty" | "error" };

interface StorageRow extends RowDataPacket {
  tableName: string;
  bytes: string | number | null;
}

/** Never interpret missing/unavailable metadata as zero storage. */
export function summarizeStorage(rows: StorageRow[]): DatabaseStorage {
  const components: StorageComponent[] = [];
  for (const table of WEATHER_STORAGE_TABLES) {
    const row = rows.find((entry) => entry.tableName === table);
    if (!row) continue;
    const bytes = row.bytes === null ? NaN : Number(row.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) return { status: "error" };
    components.push({ table, bytes });
  }
  if (components.length === 0) return { status: "empty" };
  const totalBytes = components.reduce((sum, component) => sum + component.bytes, 0);
  if (!Number.isSafeInteger(totalBytes)) return { status: "error" };
  return {
    status: "ok",
    components,
    totalBytes,
    missingTables: WEATHER_STORAGE_TABLES.filter(
      (table) => !components.some((component) => component.table === table),
    ),
  };
}

/** Read-only MySQL metadata, using the existing central pool through Drizzle.
 * InnoDB statistics are approximate; excludes logs, backups and free server disk.
 * No ANALYZE TABLE (writes/locking) and no access to other databases.
 */
export async function getDatabaseStorage(): Promise<DatabaseStorage> {
  try {
    // Drizzle types raw mysql2 results as ResultSetHeader even for SELECT.
    const [rows] = (await db.execute(sql`
      SELECT TABLE_NAME AS tableName, DATA_LENGTH + INDEX_LENGTH AS bytes
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME IN (${sql.join(
          WEATHER_STORAGE_TABLES.map((name) => sql`${name}`),
          sql`, `,
        )})
    `)) as unknown as [StorageRow[], unknown];
    return summarizeStorage(rows);
  } catch {
    // Deliberately do not return SQL errors, hostnames or connection details.
    return { status: "error" };
  }
}
