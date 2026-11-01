import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/db/storage", () => ({ getDatabaseStorage: vi.fn() }));
const { getDatabaseStorage } = await import("@/lib/db/storage");
const { DatabaseStorageCard } = await import("@/app/station/beheer/database-storage");
beforeEach(() => vi.clearAllMocks());

it("renders total and table breakdown without suggesting a capacity percentage", async () => {
  vi.mocked(getDatabaseStorage).mockResolvedValue({
    status: "ok",
    totalBytes: 1500000,
    missingTables: [],
    components: [{ table: "raw_weather_packets", bytes: 1500000 }],
  });
  const html = renderToStaticMarkup(await DatabaseStorageCard());
  expect(html).toContain("1,5 MB");
  expect(html).toContain("raw_weather_packets");
  expect(html).toContain('role="img"');
  expect(html).toContain("geen bevestigde Aiven-planlimiet");
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
