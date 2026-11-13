import { cloneElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/db/storage", () => ({ getDatabaseStorage: vi.fn() }));
vi.mock("@/lib/db/service-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/service-storage")>();
  return { ...actual, getServiceStorage: vi.fn(), getSqlDistribution: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: {} }));
import { getDatabaseStorage } from "@/lib/db/storage";
import {
  getServiceStorage,
  getSqlDistribution,
  anonymizeSchemas,
} from "@/lib/db/service-storage";
import { ServiceStorageSummary } from "@/app/station/beheer/service-storage-summary";
import { DatabaseStorageCard } from "@/app/station/beheer/database-storage";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabaseStorage).mockResolvedValue({
    status: "ok",
    totalBytes: 1500000,
    missingTables: [],
    components: [{ table: "raw_weather_packets", bytes: 1500000 }],
  });
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: null,
    limitBytes: null,
    measuredAt: null,
  });
  vi.mocked(getSqlDistribution).mockResolvedValue({ status: "unavailable" });
});
// Render async server child separately, as React's static renderer cannot resolve it.
it("preserves weather table breakdown", async () => {
  const card = await DatabaseStorageCard();
  const content = card.props.children[1];
  const html = renderToStaticMarkup(
    cloneElement(card, {}, [
      card.props.children[0],
      cloneElement(content, {}, content.props.children.slice(1)),
    ]),
  );
  expect(html).toContain("raw_weather_packets");
  expect(html).toContain("1,5 MB");
  expect(html).not.toContain("progressbar");
});
it("never substitutes SQL for unavailable physical disk metrics", async () => {
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  expect(html).toContain("Schijfgebruik onbekend");
  expect(html).toContain("geen 30-dagenprognose beschikbaar");
  expect(html).toContain("De app bewaart hiervoor nog geen historische schijfmetingen");
  expect(html).not.toContain("progressbar");
});
it("renders anonymous segments, aggregate legend and measured thresholds", async () => {
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: 85,
    limitBytes: 1e9,
    measuredAt: "2026-11-12T10:00:00Z",
  });
  vi.mocked(getSqlDistribution).mockResolvedValue(
    anonymizeSchemas(
      [
        { schemaName: "defaultdb", isWeather: 1, bytes: 45e6 },
        { schemaName: "tenhaaken_energy", isWeather: 0, bytes: 20e6 },
        { schemaName: "future_private", isWeather: 0, bytes: 30e6 },
      ],
      "secret",
    ),
  );
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  for (const value of [
    "Verbruik in MB onbekend",
    "85%",
    "Dringend",
    "Weerstation",
    "Overige databases",
  ])
    expect(html).toContain(value);
  for (const value of ["tenhaaken_energy", "defaultdb", "future_private", "secret"])
    expect(html).not.toContain(value);
});
it("keeps SQL estimates separate if they exceed measured consumption", async () => {
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: 1,
    limitBytes: 1e9,
    measuredAt: null,
  });
  vi.mocked(getSqlDistribution).mockResolvedValue(
    anonymizeSchemas([{ schemaName: "defaultdb", isWeather: 1, bytes: 45e6 }], "secret"),
  );
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  expect(html).toContain("uitsluitend de onderlinge SQL-verdeling");
  expect(html).not.toContain("Niet-toegerekende serverruimte:");
});
