import { cloneElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/db/service-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/service-storage")>();
  return { ...actual, getServiceStorage: vi.fn(), getSqlDistribution: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: {} }));
import {
  getServiceStorage,
  getSqlDistribution,
  anonymizeSchemas,
} from "@/lib/db/service-storage";
import { ServiceStorageSummary } from "@/app/station/beheer/service-storage-summary";
import { DatabaseStorageCard } from "@/app/station/beheer/database-storage";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: null,
    limitBytes: null,
    measuredAt: null,
  });
  vi.mocked(getSqlDistribution).mockResolvedValue({ status: "unavailable" });
});

it("shows a single overview card without a redundant weather table breakdown", () => {
  const card = DatabaseStorageCard();
  const content = card.props.children[1];
  const html = renderToStaticMarkup(
    cloneElement(card, {}, card.props.children[0], cloneElement(content, {}, null)),
  );
  expect(html).toContain("Database-opslag");
  expect(html).not.toContain("Details weerstationtabellen");
  expect(html).not.toContain("Verdeling per tabel");
});

it("never substitutes SQL for unavailable physical disk metrics", async () => {
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  expect(html).toContain("Niet beschikbaar");
  expect(html).toContain("waarschuwingen kunnen niet worden bepaald");
  expect(html).not.toContain("progressbar");
});

it("renders one segmented bar with measured disk usage and estimated database shares", async () => {
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
    "Abonnementsruimte",
    "85%",
    "Alarm",
    "Weerstation (schatting)",
    "Overige zichtbare databases (schatting)",
    "Overige schijfruimte / overhead",
    "Nog beschikbaar",
    "755,00 MB",
    "150,00 MB",
    'role="progressbar"',
  ])
    expect(html).toContain(value);
  for (const value of ["tenhaaken_energy", "defaultdb", "future_private", "secret"])
    expect(html).not.toContain(value);
});

it("preserves safe Aiven totals but hides split when SQL values are inconsistent", async () => {
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: 1,
    limitBytes: 1e9,
    measuredAt: null,
  });
  vi.mocked(getSqlDistribution).mockResolvedValue(
    anonymizeSchemas([{ schemaName: "defaultdb", isWeather: 1, bytes: 45e6 }], "secret"),
  );
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  expect(html).toContain("Geen betrouwbare databaseverdeling");
  expect(html).toContain("Totaal gebruikt (niet uitgesplitst)");
  expect(html).not.toContain("Overige schijfruimte / overhead");
});

it("falls back to verified Aiven totals when SQL metadata is unavailable", async () => {
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: 20,
    limitBytes: 1e9,
    measuredAt: null,
  });
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  expect(html).toContain(
    "Verdeling van Weerstation en overige databases niet beschikbaar",
  );
  expect(html).toContain("800,00 MB");
});

it.each([74.99, 75, 84.99, 85])(
  "shows the correct page alert at %s percent",
  async (percent) => {
    vi.mocked(getServiceStorage).mockResolvedValue({
      percent,
      limitBytes: 1e9,
      measuredAt: null,
    });
    const html = renderToStaticMarkup(await ServiceStorageSummary());
    expect(html.includes('role="alert"')).toBe(percent >= 75);
    if (percent >= 85) expect(html).toContain("Alarm: minstens 85%");
    else if (percent >= 75) expect(html).toContain("Waarschuwing: minstens 75%");
  },
);

it.each([1e9, 8e9])("shows current subscription capacity %s", async (limitBytes) => {
  vi.mocked(getServiceStorage).mockResolvedValue({
    percent: 10,
    limitBytes,
    measuredAt: null,
  });
  const html = renderToStaticMarkup(await ServiceStorageSummary());
  expect(html).toContain(limitBytes === 1e9 ? "1,00 GB" : "8,00 GB");
});

it("retains the agreed reminder date without requiring an upgrade", async () => {
  vi.stubEnv("AIVEN_STORAGE_REVIEW_DATE", "2026-12-03");
  try {
    const html = renderToStaticMarkup(await ServiceStorageSummary());
    expect(html).toContain("2026-12-03");
    expect(html).toContain("Geen automatische abonnementswijziging of e-mail");
  } finally {
    vi.unstubAllEnvs();
  }
});
