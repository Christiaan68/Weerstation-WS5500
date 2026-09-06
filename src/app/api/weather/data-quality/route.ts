/**
 * Datakwaliteitscijfers voor één kalendermaand (Fase 4, §25/§29/§30) —
 * `GET /api/weather/data-quality?year=2026&month=9`.
 *
 * Leest bewust de al bestaande `daily_weather_summary`-tabel (Fase 3) i.p.v.
 * opnieuw over `weather_observations` te aggregeren: die tabel bevat al
 * `observationCount`/`expectedObservationCount`/`coveragePct` per lokale dag,
 * DST-correct berekend (zie `summary.ts`/`timezone.ts`). Voor een dag zonder
 * samenvattingsrij (nooit een meting ontvangen) wordt een "0%"-rij opgebouwd
 * op basis van dezelfde DST-bewuste daglengte, zodat de kalender/tabel nooit
 * een gat toont zonder verklaring.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDataQualityPeriodStats, getStation, listDailySummaries } from "@/lib/db/queries";
import { DEFAULT_POLL_INTERVAL_SECONDS, localDateKeysInMonth } from "@/lib/weather/summary-service";
import { computeExpectedObservationCount } from "@/lib/weather/summary";
import {
  getLocalDayBoundsUtc,
  getLocalMonthBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  stationSlug: z.string().optional(),
});

export interface DailyCompletenessRow {
  localDate: string;
  expected: number;
  received: number;
  missing: number;
  coveragePct: number | null;
  /** `false` zolang deze lokale dag nog niet (volledig) voorbij is — een lage dekking is dan geen "probleem", gewoon nog niet compleet. */
  dayEnded: boolean;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige queryparameters", details: parsed.error.issues },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const station = await getStation(parsed.data.stationSlug);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date();
    const todayKey = todayLocalDateKey();
    const [todayYearStr, todayMonthStr] = todayKey.split("-");
    const year = parsed.data.year ?? Number(todayYearStr);
    const month = parsed.data.month ?? Number(todayMonthStr);

    const dateKeys = localDateKeysInMonth(year, month).filter((key) => key <= todayKey);

    const days: DailyCompletenessRow[] = [];
    if (dateKeys.length > 0) {
      const summaries = await listDailySummaries(
        station.id,
        dateKeys[0]!,
        dateKeys[dateKeys.length - 1]!,
      );
      const summaryByDate = new Map(summaries.map((row) => [row.localDate, row]));

      for (const dateKey of dateKeys) {
        const bounds = getLocalDayBoundsUtc(dateKey);
        const dayEnded = bounds.endUtc <= now;
        const summary = summaryByDate.get(dateKey);

        if (summary) {
          const expected =
            summary.expectedObservationCount ??
            computeExpectedObservationCount(bounds.durationSeconds, DEFAULT_POLL_INTERVAL_SECONDS);
          const received = summary.observationCount;
          days.push({
            localDate: dateKey,
            expected,
            received,
            missing: Math.max(0, expected - received),
            coveragePct: summary.coveragePct === null ? null : Number(summary.coveragePct),
            dayEnded,
          });
        } else {
          const expected = computeExpectedObservationCount(
            bounds.durationSeconds,
            DEFAULT_POLL_INTERVAL_SECONDS,
          );
          days.push({
            localDate: dateKey,
            expected,
            received: 0,
            missing: expected,
            coveragePct: dayEnded ? 0 : null,
            dayEnded,
          });
        }
      }
    }

    const { startUtc, endUtc } = getLocalMonthBoundsUtc(year, month);
    const periodStats = await getDataQualityPeriodStats(station.id, startUtc, endUtc);

    return NextResponse.json(
      {
        year,
        month,
        pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
        days,
        periodStats,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/data-quality] databasefout:", message);
    return NextResponse.json(
      { error: "Kon datakwaliteitscijfers niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
