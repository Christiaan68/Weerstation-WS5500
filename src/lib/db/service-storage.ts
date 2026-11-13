/** Server-side only. Never return upstream objects, schema names or errors. */
import { createHmac } from "node:crypto";
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
const SYSTEM_SCHEMAS = new Set([
  "mysql",
  "sys",
  "information_schema",
  "performance_schema",
]);

export function anonymizeSchemas(rows: SchemaRow[], secret: string): SqlDistribution {
  let weatherBytes = 0;
  const others: { bytes: number; color: string }[] = [];
  for (const row of rows) {
    if (SYSTEM_SCHEMAS.has(row.schemaName.toLowerCase())) continue;
    const bytes = parseSqlStorageBytes(row.bytes);
    if (bytes === null) return { status: "unavailable" };
    if (Number(row.isWeather) === 1) weatherBytes += bytes;
    else {
      // Keyed colour: no reversible name encoding or stable database ID leaves the server.
      const digest = createHmac("sha256", secret).update(row.schemaName).digest();
      const hue = (digest.readUInt16BE(0) % 170) + 260; // avoids weather blue
      others.push({ bytes, color: `hsl(${hue % 360} 65% 55%)` });
    }
  }
  const otherBytes = others.reduce((sum, item) => sum + item.bytes, 0);
  if (!Number.isSafeInteger(weatherBytes + otherBytes) ||
    !rows.some((row) => !SYSTEM_SCHEMAS.has(row.schemaName.toLowerCase())))
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

function metricTime(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const google =
    /^Date\((\d{4}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2})\)$/.exec(value);
  if (google) {
    const parts = google.slice(1).map(Number);
    const date = new Date(
      Date.UTC(
        ...(google.slice(1).map(Number) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ]),
      ),
    );
    const actual = [
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ];
    return actual.every((value, i) => value === parts[i]) ? date.getTime() : NaN;
  }
  // Require timezone for ISO dates: no host-local interpretation.
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
}

/** Aiven metrics endpoint returns Google Charts DataTable; unknown shapes fail closed. */
export function parseDiskMetric(
  payload: unknown,
  now = Date.now(),
): Pick<ServiceStorage, "percent" | "measuredAt"> {
  const unavailable = { percent: null, measuredAt: null };
  const chart = record(record(record(payload).metrics).disk_usage);
  if (!Array.isArray(chart.cols) || !Array.isArray(chart.rows)) return unavailable;
  if (
    Array.isArray(record(payload).errors) &&
    (record(payload).errors as unknown[]).length
  )
    return unavailable;
  const columns = chart.cols.map(record);
  const timeIndex = columns.findIndex((c) => c.type === "datetime" || c.type === "date");
  const numbers = columns.flatMap((c, i) => (c.type === "number" ? [i] : []));
  if (
    timeIndex < 0 ||
    numbers.length === 0 ||
    columns.filter((c) => c.type === "datetime" || c.type === "date").length !== 1
  )
    return unavailable;
  let latest = -Infinity;
  let percent: number | null = null;
  for (const raw of chart.rows) {
    const cells = record(raw).c;
    if (!Array.isArray(cells)) continue;
    const time = metricTime(record(cells[timeIndex]).v);
    if (
      !Number.isFinite(time) ||
      time > now + 60_000 ||
      now - time > 15 * 60_000 ||
      time <= latest
    )
      continue;
    latest = time;
    percent = null;
    const values = numbers.map((i) => record(cells[i]).v);
    // Missing nodes must never appear as unused disk.
    if (
      !values.every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100,
      )
    )
      continue;
    percent = Math.max(...(values as number[]));
    latest = time;
  }
  return percent === null
    ? unavailable
    : { percent, measuredAt: new Date(latest).toISOString() };
}

export function storageWarning(percent: number | null): "critical" | "warning" | null {
  if (percent === null || !Number.isFinite(percent) || percent < 0) return null;
  return percent >= 85 ? "critical" : percent >= 70 ? "warning" : null;
}

export async function getServiceStorage(): Promise<ServiceStorage> {
  if (typeof window !== "undefined") throw new Error("Server only");
  const empty = { limitBytes: null, percent: null, measuredAt: null };
  const token = process.env.AIVEN_API_TOKEN;
  const project = process.env.AIVEN_PROJECT;
  const service = process.env.AIVEN_SERVICE_NAME;
  if (!token || !project || !service) return empty;
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
      return response.ok ? ((await response.json()) as unknown) : null;
    } catch {
      return null;
    }
  };
  const [metadata, metrics] = await Promise.all([read(false), read(true)]);
  return {
    limitBytes: parseServiceLimit(metadata),
    ...parseDiskMetric(metrics),
  };
}
