import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
const { db } = await import("@/lib/db");
const { getDatabaseStorage, WEATHER_STORAGE_TABLES } = await import("@/lib/db/storage");
const { formatStorageBytes } = await import("@/lib/weather/storage-format");

beforeEach(() => vi.clearAllMocks());

describe("database storage metadata", () => {
  it("sums numeric strings and zero sizes across all nine application tables", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      WEATHER_STORAGE_TABLES.map((tableName, i) => ({
        tableName,
        bytes: i === 0 ? "1000" : 0,
      })),
      [],
    ] as never);
    const result = await getDatabaseStorage();
    expect(result).toMatchObject({ status: "ok", totalBytes: 1000, missingTables: [] });
    if (result.status === "ok") expect(result.components).toHaveLength(9);
    const query = new MySqlDialect().sqlToQuery(
      vi.mocked(db.execute).mock.calls[0]![0] as never,
    );
    expect(query.sql).toContain("TABLE_SCHEMA = DATABASE()");
    expect(query.sql).toContain("DATA_LENGTH + INDEX_LENGTH");
    expect(query.sql).toContain("TABLE_TYPE = 'BASE TABLE'");
    expect(query.params).toEqual([...WEATHER_STORAGE_TABLES]);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("reports empty metadata without inventing a zero total", async () => {
    vi.mocked(db.execute).mockResolvedValue([[], []] as never);
    expect(await getDatabaseStorage()).toEqual({ status: "empty" });
  });

  it("marks partial metadata and ignores unrelated tables", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      [
        { tableName: "stations", bytes: 100 },
        { tableName: "unrelated", bytes: 999 },
      ],
      [],
    ] as never);
    const result = await getDatabaseStorage();
    expect(result).toMatchObject({
      status: "ok",
      totalBytes: 100,
      components: [{ table: "stations", bytes: 100 }],
    });
    if (result.status === "ok") expect(result.missingTables).toHaveLength(8);
  });

  it.each([null, "bad", -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unavailable/invalid size %s",
    async (bytes) => {
      vi.mocked(db.execute).mockResolvedValue([
        [{ tableName: "stations", bytes }],
        [],
      ] as never);
      expect(await getDatabaseStorage()).toEqual({ status: "error" });
    },
  );

  it("does not expose connection errors or secrets", async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error("mysql://secret@private-host"));
    expect(await getDatabaseStorage()).toEqual({ status: "error" });
  });
});

describe("storage units", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1000, "1 KB"],
    [1500000, "1,5 MB"],
    [2400000000, "2,4 GB"],
  ])("formats %s bytes", (bytes, expected) => {
    expect(formatStorageBytes(bytes as number)).toBe(expected);
  });
});
