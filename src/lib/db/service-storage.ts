/** Server-side only. Never return upstream objects, schema names or errors. */
import { createHmac } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFile, rename, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { parseSqlStorageBytes } from "@/lib/db/storage-metadata";

type SchemaRow = {
  schemaName: string;
  isWeather: number;
  bytes: string | number | null;
};
export type SqlDistribution =
  | {
      status: "ok";
      weatherBytes: number;
      otherBytes: number;
      totalBytes: number;
      others: { bytes: number; color: string }[];
    }
  | { status: "unavailable" };
export type ServiceStorage = {
  limitBytes: number | null;
  percent: number | null;
  measuredAt: string | null;
};
export const STORAGE_MAX_AGE_MS = 15 * 60_000;
const EMPTY_STORAGE: ServiceStorage = {
  limitBytes: null,
  percent: null,
  measuredAt: null,
};

function fresh(value: unknown, now: number): boolean {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  return (
    Number.isFinite(time) && time <= now + 60_000 && now - time <= STORAGE_MAX_AGE_MS
  );
}

// Bind persisted observations to this configuration, without saving credentials.
function storageIdentity(): string {
  return createHmac("sha256", process.env.SITE_AUTH_SESSION_SECRET || "storage")
    .update(
      JSON.stringify([
        process.env.AIVEN_PROJECT,
        process.env.AIVEN_SERVICE_NAME,
        process.env.DATABASE_URL,
      ]),
    )
    .digest("hex");
}

export async function saveStorageSnapshot(storage: ServiceStorage): Promise<void> {
  const path = process.env.AIVEN_STORAGE_SNAPSHOT_PATH;
  if (!path) throw new Error("AIVEN_STORAGE_SNAPSHOT_PATH ontbreekt");
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({
      ...storage,
      checkedAt: new Date().toISOString(),
      identity: storageIdentity(),
    }),
    { mode: 0o600 },
  );
  await rename(temporary, path);
}

async function readStorageSnapshot(): Promise<ServiceStorage> {
  try {
    const data = record(
      JSON.parse(await readFile(process.env.AIVEN_STORAGE_SNAPSHOT_PATH!, "utf8")),
    );
    const now = Date.now();
    if (data.identity !== storageIdentity() || !fresh(data.checkedAt, now))
      return EMPTY_STORAGE;
    const limitBytes =
      typeof data.limitBytes === "number" &&
      Number.isSafeInteger(data.limitBytes) &&
      data.limitBytes > 0
        ? data.limitBytes
        : null;
    const percent =
      typeof data.percent === "number" &&
      Number.isFinite(data.percent) &&
      data.percent >= 0 &&
      data.percent <= 100 &&
      fresh(data.measuredAt, now)
        ? data.percent
        : null;
    return {
      limitBytes,
      percent,
      measuredAt: percent === null ? null : (data.measuredAt as string),
    };
  } catch {
    return EMPTY_STORAGE;
  }
}

/** Do not show storage belonging to another service beside this database. */
export function matchesDatabaseService(
  payload: unknown,
  databaseUrl: string | undefined,
): boolean {
  try {
    const errors = record(payload).errors;
    if (errors && (!Array.isArray(errors) || errors.length)) return false;
    const service = record(record(payload).service);
    const actual = new URL(String(service.service_uri));
    const expected = new URL(databaseUrl || "");
    return (
      service.service_type === "mysql" &&
      actual.protocol === "mysql:" &&
      expected.protocol === "mysql:" &&
      actual.hostname === expected.hostname &&
      (actual.port || "3306") === (expected.port || "3306")
    );
  } catch {
    return false;
  }
}
const SYSTEM_SCHEMAS = new Set([
  "mysql",
  "sys",
  "information_schema",
  "performance_schema",
]);

export function anonymizeSchemas(rows: SchemaRow[], secret: string): SqlDistribution {
  let weatherBytes = 0;
  let hasWeatherSchema = false;
  const others: { bytes: number; color: string }[] = [];
  for (const row of rows) {
    if (SYSTEM_SCHEMAS.has(row.schemaName.toLowerCase())) continue;
    const bytes = parseSqlStorageBytes(row.bytes);
    if (bytes === null) return { status: "unavailable" };
    if (Number(row.isWeather) === 1) {
      hasWeatherSchema = true;
      weatherBytes += bytes;
    } else {
      // Keyed colour: no reversible name encoding or stable database ID leaves the server.
      const digest = createHmac("sha256", secret).update(row.schemaName).digest();
      const hue = (digest.readUInt16BE(0) % 170) + 260; // avoids weather blue
      others.push({ bytes, color: `hsl(${hue % 360} 65% 55%)` });
    }
  }
  const otherBytes = others.reduce((sum, item) => sum + item.bytes, 0);
  if (!Number.isSafeInteger(weatherBytes + otherBytes) || !hasWeatherSchema)
    return { status: "unavailable" };
  // Order by presentation, never expose schema ordering or identifiers.
  others.sort((a, b) => a.color.localeCompare(b.color) || a.bytes - b.bytes);
  return {
    status: "ok",
    weatherBytes,
    otherBytes,
    totalBytes: weatherBytes + otherBytes,
    others,
  };
}

export async function getSqlDistribution(): Promise<SqlDistribution> {
  if (typeof window !== "undefined") throw new Error("Server only");
  // Reuse an existing server-side secret; do not introduce a name-derived public hash.
  const secret = process.env.SITE_AUTH_SESSION_SECRET || process.env.DATABASE_URL;
  if (!secret) return { status: "unavailable" };
  try {
    const [rows] = (await db.execute(sql`
      SELECT s.SCHEMA_NAME AS schemaName, s.SCHEMA_NAME = DATABASE() AS isWeather,
        COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS bytes
      FROM information_schema.SCHEMATA s
      LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME AND t.TABLE_TYPE = 'BASE TABLE'
      WHERE s.SCHEMA_NAME NOT IN ('mysql', 'sys', 'information_schema', 'performance_schema')
      GROUP BY s.SCHEMA_NAME
    `)) as unknown as [SchemaRow[], unknown];
    return anonymizeSchemas(rows, secret);
  } catch {
    return { status: "unavailable" };
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseServiceLimit(payload: unknown): number | null {
  if (
    record(payload).errors &&
    (!Array.isArray(record(payload).errors) ||
      (record(payload).errors as unknown[]).length)
  )
    return null;
  const service = record(record(payload).service);
  if (service.service_type !== "mysql") return null;
  // Aiven disk_space_mb is MiB (not decimal MB), including provisioned extra disk.
  const value = service.disk_space_mb;
  return typeof value === "number" && value > 0 && Number.isSafeInteger(value * 1024 ** 2)
    ? value * 1024 ** 2
    : null;
}

/** Unwrap a Google Charts cell once; compact rows already contain values. */
function cellValue(value: unknown): unknown {
  return value !== null && typeof value === "object" && "v" in value
    ? (value as { v: unknown }).v
    : value;
}

function metricTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return NaN;
  const google =
    /^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,3}))?)?\s*\)$/.exec(
      value,
    );
  if (google) {
    const parts = google.slice(1).map((part) => Number(part ?? 0));
    const [year, month, day, hour, minute, second, ms] = parts;
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
    const actual = [
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ];
    return actual.every((part, i) => part === parts[i]) ? date.getTime() : NaN;
  }
  // Require timezone for ISO dates: no host-local interpretation.
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
}

/** Allowlisted diagnostics only: never include upstream strings or objects. */
export type StorageDiagnostic = {
  stage: "metric" | "service" | "metrics";
  reason: string;
  rowIndex?: number;
  rowCount?: number;
  columnCount?: number;
  timeKind?: string;
  numericCount?: number;
  cellStructure?: {
    kind: string;
    keys: string[];
    matchesColumn: boolean;
    matchesType: boolean;
    matchesLabel: boolean;
    matchesId: boolean;
  }[];
  status?: number;
};
type Diagnose = (event: StorageDiagnostic) => void;

/** Aiven metrics endpoint returns Google Charts DataTable; unknown shapes fail closed. */
export function parseDiskMetric(
  payload: unknown,
  now = Date.now(),
  diagnose?: Diagnose,
): Pick<ServiceStorage, "percent" | "measuredAt"> {
  const unavailable = { percent: null, measuredAt: null };
  const reject = (reason: string, detail: Partial<StorageDiagnostic> = {}) => {
    diagnose?.({ stage: "metric", reason, ...detail });
    return unavailable;
  };
  const diskUsage = record(record(record(payload).metrics).disk_usage);
  // Aiven supplies its Google Charts table in disk_usage.data. Also accept the
  // older direct-table response so existing integrations and tests keep working.
  const chart = "data" in diskUsage ? record(diskUsage.data) : diskUsage;
  if (!Array.isArray(chart.cols) || !Array.isArray(chart.rows))
    return reject("invalid_table");
  diagnose?.({
    stage: "metric",
    reason: "table",
    rowCount: chart.rows.length,
    columnCount: chart.cols.length,
  });
  if (
    record(payload).errors &&
    (!Array.isArray(record(payload).errors) ||
      (record(payload).errors as unknown[]).length)
  )
    return reject("upstream_errors");
  const columns = chart.cols.map(record);
  const timeIndex = columns.findIndex((c) => c.type === "datetime" || c.type === "date");
  const numbers = columns.flatMap((c, i) => (c.type === "number" ? [i] : []));
  if (
    timeIndex < 0 ||
    numbers.length === 0 ||
    columns.filter((c) => c.type === "datetime" || c.type === "date").length !== 1
  )
    return reject("invalid_columns");
  let latest = -Infinity;
  let percent: number | null = null;
  let incomplete = false;
  let incompleteReason = "invalid_latest_reading";
  let latestReadings: unknown[] | null = null;
  for (const [rowIndex, raw] of chart.rows.entries()) {
    // Accept explicit cells and compact value rows; never infer metric units.
    const cells = Array.isArray(raw) ? raw : record(raw).c;
    if (!Array.isArray(cells)) return reject("invalid_row", { rowIndex });
    const values = cells.map(cellValue);
    // Only an exact leading column-header row is metadata. Never skip an
    // arbitrary first row: an undated numeric alarm must invalidate the result.
    if (
      rowIndex === 0 &&
      values.length === columns.length &&
      values.every(
        (value, i) =>
          (typeof value === "string" &&
            [columns[i].label, columns[i].id, columns[i].type].includes(value)) ||
          // Live Aiven tables repeat column descriptors as the first row.
          // Require exact metadata, with no value-bearing or unknown fields.
          (Object.keys(record(value)).length > 0 &&
            Object.keys(record(value)).every((key) =>
              ["type", "label", "id"].includes(key),
            ) &&
            isDeepStrictEqual(value, columns[i])),
      )
    )
      continue;
    const timestamp = values[timeIndex];
    const time = metricTime(timestamp);
    if (!Number.isFinite(time)) {
      // Ignore undated Google Charts placeholders only when every metric is empty.
      // Never trust a numeric metric without a verifiable timestamp.
      const emptyValues = numbers.every((i) => values[i] == null);
      if (emptyValues) continue;
      return reject("undated_nonempty_row", {
        rowIndex,
        timeKind: timestamp === null ? "null" : typeof timestamp,
        numericCount: numbers.filter((i) => typeof values[i] === "number").length,
        cellStructure: values.map((value, i) => ({
          kind: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
          keys: ["v", "f", "type", "label", "id", "c", "value"].filter(
            (key) => key in record(value),
          ),
          matchesColumn: isDeepStrictEqual(value, columns[i]),
          matchesType:
            record(value).type !== undefined && record(value).type === columns[i]?.type,
          matchesLabel:
            record(value).label !== undefined &&
            record(value).label === columns[i]?.label,
          matchesId:
            record(value).id !== undefined && record(value).id === columns[i]?.id,
        })),
      });
    }
    if (time > now + 60_000) return reject("future_timestamp", { rowIndex });
    if (now - time > STORAGE_MAX_AGE_MS || time < latest) continue;
    if (time > latest) {
      percent = null;
      incomplete = false;
      latestReadings = null;
    }
    latest = time;
    const readings = numbers.map((i) => values[i]);
    // Missing nodes must never appear as unused disk.
    if (
      !readings.every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100,
      )
    ) {
      incomplete = true;
      incompleteReason = "invalid_latest_reading";
      continue;
    }
    const candidate = Math.max(...(readings as number[]));
    // Duplicate timestamps must agree; choosing the higher duplicate conceals
    // an internally contradictory response. Distinct nodes use their maximum.
    if (latestReadings && readings.some((value, i) => value !== latestReadings![i])) {
      incomplete = true;
      incompleteReason = "conflicting_latest_readings";
    }
    latestReadings = readings;
    percent = candidate;
  }
  if (incomplete) return reject(incompleteReason);
  if (percent === null) return reject("no_recent_reading");
  diagnose?.({ stage: "metric", reason: "accepted" });
  return { percent, measuredAt: new Date(latest).toISOString() };
}

export function storageWarning(percent: number | null): "critical" | "warning" | null {
  if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100)
    return null;
  return percent >= 85 ? "critical" : percent >= 75 ? "warning" : null;
}

export async function getServiceStorage(
  options: { live?: boolean; diagnose?: Diagnose } = {},
): Promise<ServiceStorage> {
  if (typeof window !== "undefined") throw new Error("Server only");
  if (process.env.AIVEN_STORAGE_SNAPSHOT_PATH && !options.live)
    return readStorageSnapshot();
  const empty = { limitBytes: null, percent: null, measuredAt: null };
  const token = process.env.AIVEN_API_TOKEN;
  const project = process.env.AIVEN_PROJECT;
  const service = process.env.AIVEN_SERVICE_NAME;
  if (!token || !project || !service) {
    options.diagnose?.({ stage: "service", reason: "missing_configuration" });
    return empty;
  }
  const url = `https://api.aiven.io/v1/project/${encodeURIComponent(project)}/service/${encodeURIComponent(service)}`;
  const read = async (metrics: boolean) => {
    try {
      // POST /metrics is Aiven's read-only metrics retrieval, not a service mutation.
      const response = await fetch(url + (metrics ? "/metrics" : ""), {
        method: metrics ? "POST" : "GET",
        headers: {
          Authorization: `aivenv1 ${token}`,
          "Content-Type": "application/json",
        },
        ...(metrics ? { body: JSON.stringify({ period: "hour" }) } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      options.diagnose?.({
        stage: metrics ? "metrics" : "service",
        reason: "http_response",
        status: response.status,
      });
      return response.ok ? ((await response.json()) as unknown) : null;
    } catch {
      options.diagnose?.({
        stage: metrics ? "metrics" : "service",
        reason: "request_or_json_failed",
      });
      return null;
    }
  };
  const [metadata, metrics] = await Promise.all([read(false), read(true)]);
  if (!matchesDatabaseService(metadata, process.env.DATABASE_URL)) {
    options.diagnose?.({ stage: "service", reason: "database_service_mismatch" });
    return empty;
  }
  return {
    limitBytes: parseServiceLimit(metadata),
    ...parseDiskMetric(metrics, Date.now(), options.diagnose),
  };
}
