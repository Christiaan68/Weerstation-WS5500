import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
import { db } from "@/lib/db";
import {
  anonymizeSchemas,
  getSqlDistribution,
  getServiceStorage,
  parseDiskMetric,
  parseServiceLimit,
  storageWarning,
} from "@/lib/db/service-storage";
const now = Date.parse("2026-11-12T10:00:00Z");
const metric = (value: unknown = 38, time = "2026-11-12T09:59:00Z") => ({
  metrics: {
    disk_usage: {
      cols: [{ type: "datetime" }, { type: "number" }],
      rows: [{ c: [{ v: time }, { v: value }] }],
    },
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AIVEN_API_TOKEN", "");
  vi.stubEnv("DATABASE_URL", "mysql://private");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("includes future schemas, hides all identities and preserves colours as schemas are added", () => {
  const rows = [
    { schemaName: "defaultdb", isWeather: 1, bytes: 10 },
    { schemaName: "private-business", isWeather: 0, bytes: "20" },
  ];
  const a = anonymizeSchemas(rows, "secret");
  const b = anonymizeSchemas(
    [
      ...rows,
      { schemaName: "future-private", isWeather: 0, bytes: 30 },
      { schemaName: "mysql", isWeather: 0, bytes: 100 },
    ],
    "secret",
  );
  expect(a.status).toBe("ok");
  expect(b.status).toBe("ok");
  if (a.status !== "ok" || b.status !== "ok") throw Error();
  expect(b.totalBytes).toBe(60);
  expect(b.otherBytes).toBe(50);
  expect(b.others).toContainEqual(a.others[0]);
  expect(JSON.stringify(b)).not.toMatch(/private|defaultdb|schemaName|isWeather/);
  expect(anonymizeSchemas([{ ...rows[0], bytes: null }], "secret").status).toBe(
    "unavailable",
  );
});
it("queries only metadata and sanitizes errors", async () => {
  vi.mocked(db.execute).mockResolvedValueOnce([
    [{ schemaName: "secret-db", isWeather: 0, bytes: 42 }],
    [],
  ] as never);
  expect(JSON.stringify(await getSqlDistribution())).not.toContain("secret-db");
  vi.mocked(db.execute).mockRejectedValueOnce(new Error("secret-db password"));
  expect(await getSqlDistribution()).toEqual({ status: "unavailable" });
});
it("uses live MiB metadata, including a 1 to 8 GiB plan change", () => {
  for (const size of [1024, 8192])
    expect(
      parseServiceLimit({
        service: { service_type: "mysql", disk_space_mb: size },
      }),
    ).toBe(size * 1024 ** 2);
  for (const disk_space_mb of [undefined, null, 0, -1, "1024", Infinity])
    expect(
      parseServiceLimit({ service: { service_type: "mysql", disk_space_mb } }),
    ).toBeNull();
});
it("accepts fresh disk percentages and rejects stale, missing and invalid metrics", () => {
  expect(parseDiskMetric(metric(), now).percent).toBe(38);
  expect(parseDiskMetric(metric(0), now).percent).toBe(0);
  for (const payload of [
    null,
    {},
    metric(null),
    metric("38"),
    metric(-1),
    metric(101),
    metric(38, "2026-11-11T09:59:00Z"),
  ])
    expect(parseDiskMetric(payload, now).percent).toBeNull();
  expect(parseDiskMetric(metric(38, "Date(2026,10,12,9,59,0)"), now).percent).toBe(38);
});
it.each([
  [null, null],
  [69.99, null],
  [70, "warning"],
  [84.99, "warning"],
  [85, "critical"],
  [100, "critical"],
] as const)("threshold %s -> %s", (percent, warning) =>
  expect(storageWarning(percent)).toBe(warning),
);
it("does not call Aiven without credentials or fall back to a static capacity", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("DATABASE_STORAGE_LIMIT_BYTES", "1000000000");
  expect(await getServiceStorage()).toEqual({
    limitBytes: null,
    percent: null,
    measuredAt: null,
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("refreshes plan metadata each time and independently handles failed metrics", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("AIVEN_API_TOKEN", "private-token");
  vi.stubEnv("AIVEN_PROJECT", "project");
  vi.stubEnv("AIVEN_SERVICE_NAME", "service");
  let size = 1024;
  let unavailable = false;
  const fetch = vi.fn(async (url: string) => ({
    ok: !url.endsWith("/metrics") || !unavailable,
    json: async () =>
      url.endsWith("/metrics")
        ? metric()
        : { service: { service_type: "mysql", disk_space_mb: size } },
  }));
  vi.stubGlobal("fetch", fetch);
  expect((await getServiceStorage()).limitBytes).toBe(1024 ** 3);
  size = 8192;
  unavailable = true;
  expect(await getServiceStorage()).toEqual({
    limitBytes: 8 * 1024 ** 3,
    percent: null,
    measuredAt: null,
  });
  expect(fetch.mock.calls).toHaveLength(4);
});

it("does not hide an incomplete newest measurement behind an older healthy row", () => {
  const payload = metric(20, "2026-11-12T09:58:00Z");
  payload.metrics.disk_usage.rows.push({
    c: [{ v: "2026-11-12T09:59:00Z" }, { v: null }],
  });
  expect(parseDiskMetric(payload, now).percent).toBeNull();
  payload.metrics.disk_usage.rows.reverse();
  expect(parseDiskMetric(payload, now).percent).toBeNull();
});

it("uses the highest node and rejects a missing node", () => {
  const payload = metric(20);
  payload.metrics.disk_usage.cols.push({ type: "number" });
  payload.metrics.disk_usage.rows[0].c.push({ v: 86 });
  expect(parseDiskMetric(payload, now).percent).toBe(86);
  payload.metrics.disk_usage.rows[0].c.pop();
  expect(parseDiskMetric(payload, now).percent).toBeNull();
});

it("rejects future, timezone-less and overflowing Google dates", () => {
  for (const time of [
    "2026-11-12T10:02:00Z",
    "2026-11-12T09:59:00",
    "Date(2026,9,43,9,59,0)",
  ])
    expect(parseDiskMetric(metric(38, time), now).percent).toBeNull();
});

it.each(["http", "json", "network"])(
  "fails closed on %s errors without leaking upstream details",
  async (failure) => {
    vi.stubEnv("AIVEN_API_TOKEN", "private-token");
    vi.stubEnv("AIVEN_PROJECT", "project");
    vi.stubEnv("AIVEN_SERVICE_NAME", "service");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (failure === "network") throw new Error("private upstream details");
        return {
          ok: failure !== "http",
          json: async () => {
            throw new Error("private upstream details");
          },
        };
      }),
    );
    expect(await getServiceStorage()).toEqual({
      limitBytes: null,
      percent: null,
      measuredAt: null,
    });
  },
);

it("does not report system-only metadata as zero application storage", () => {
  expect(anonymizeSchemas([{ schemaName: "mysql", isWeather: 0, bytes: 100 }], "secret")).toEqual({ status: "unavailable" });
});
it("rejects overflowing SQL totals", () => {
  expect(anonymizeSchemas([
    { schemaName: "weather", isWeather: 1, bytes: Number.MAX_SAFE_INTEGER },
    { schemaName: "other", isWeather: 0, bytes: 1 },
  ], "secret")).toEqual({ status: "unavailable" });
});
