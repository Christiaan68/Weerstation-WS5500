import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/db/storage", () => ({ getDatabaseStorage: vi.fn() }));
const { getDatabaseStorage } = await import("@/lib/db/storage");
const { DatabaseStorageCard } = await import("@/app/station/beheer/database-storage");
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    DATABASE_STORAGE_LIMIT_BYTES: process.env.DATABASE_STORAGE_LIMIT_BYTES,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_STORAGE_LIMIT_BYTES", "");
});

it("renders total and table breakdown with unknown capacity when no limit is configured", async () => {
  vi.mocked(getDatabaseStorage).mockResolvedValue({
    status: "ok",
    totalBytes: 1500000,
    missingTables: [],
    components: [{ table: "raw_weather_packets", bytes: 1500000 }],
  });
  const html = renderToStaticMarkup(await DatabaseStorageCard());
  expect(html).toContain("1,5 MB");
  expect(html).toContain("raw_weather_packets");
  expect(html).toContain("Geen bevestigde planlimiet");
  expect(html).not.toContain('role="progressbar"');
});
it.each(["error", "empty"] as const)("renders %s state", async (status) => {
  vi.mocked(getDatabaseStorage).mockResolvedValue({ status });
  const html = renderToStaticMarkup(await DatabaseStorageCard());
  expect(html).toContain('role="status"');
  expect(html).not.toContain("0 B");
});
it("labels incomplete metadata as subtotal", async () => {
  vi.mocked(getDatabaseStorage).mockResolvedValue({
    status: "ok",
    totalBytes: 0,
    components: [{ table: "stations", bytes: 0 }],
    missingTables: ["app_settings"],
  });
  const html = renderToStaticMarkup(await DatabaseStorageCard());
  expect(html).toContain("Subtotaal beschikbare tabellen");
  expect(html).toContain("Geen metadata voor: app_settings");
  expect(html).toContain("0 B");
});

it("renders capacity, remaining space and percentage alongside the table breakdown", async () => {
  vi.stubEnv("DATABASE_STORAGE_LIMIT_BYTES", "1000000000");
  vi.mocked(getDatabaseStorage).mockResolvedValue({
    status: "ok",
    totalBytes: 27750000,
    missingTables: [],
    components: [{ table: "raw_weather_packets", bytes: 27750000 }],
  });
  const html = renderToStaticMarkup(await DatabaseStorageCard());
  for (const text of [
    "27,75 MB",
    "gebruikt van 1,00 GB",
    "972,25 MB",
    "2,78%",
    "Maximaal",
    "raw_weather_packets",
    'role="progressbar"',
    "width:2.775%",
  ])
    expect(html).toContain(text);
});
it("clamps the bar and remaining space when usage exceeds capacity", async () => {
  vi.stubEnv("DATABASE_STORAGE_LIMIT_BYTES", "1000000000");
  vi.mocked(getDatabaseStorage).mockResolvedValue({
    status: "ok",
    totalBytes: 1100000000,
    missingTables: [],
    components: [{ table: "raw_weather_packets", bytes: 1100000000 }],
  });
  const html = renderToStaticMarkup(await DatabaseStorageCard());
  for (const text of [
    'aria-valuenow="100"',
    "110%",
    "0,00 B",
    "overschrijdt",
    "width:100%",
  ])
    expect(html).toContain(text);
});
