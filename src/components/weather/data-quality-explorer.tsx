"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatLocalTime, shortMonthNameNl } from "@/lib/weather/timezone";

interface DailyCompletenessRow {
  localDate: string;
  expected: number;
  received: number;
  missing: number;
  coveragePct: number | null;
  dayEnded: boolean;
}

interface DataQualityResponse {
  year: number;
  month: number;
  pollIntervalSeconds: number;
  days: DailyCompletenessRow[];
  periodStats: {
    packetStatusCounts: Record<string, number>;
    unknownFieldsPacketCount: number;
    suspectObservationCount: number;
  };
}

interface MissingInterval {
  fromExclusiveUtc: string;
  toExclusiveUtc: string;
  missingCount: number;
}

interface MissingIntervalsResponse {
  localDateKey: string;
  expected: number;
  received: number;
  missing: number;
  coveragePct: number | null;
  missingIntervals: MissingInterval[];
}

const STATUS_LABEL_NL: Record<string, string> = {
  received: "Ontvangen",
  normalized: "Genormaliseerd",
  partial: "Deels verwerkt",
  failed: "Mislukt",
  duplicate: "Duplicaat",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  received: "default",
  normalized: "success",
  partial: "warning",
  failed: "danger",
  duplicate: "default",
};

function coverageVariant(pct: number | null, dayEnded: boolean): BadgeVariant {
  if (pct === null) return "default";
  if (!dayEnded) return "default";
  if (pct >= 95) return "success";
  if (pct >= 70) return "warning";
  return "danger";
}

function coverageBgClass(pct: number | null, dayEnded: boolean): string {
  if (pct === null || !dayEnded) return "bg-muted";
  if (pct >= 95) return "bg-success/15";
  if (pct >= 70) return "bg-warning/15";
  return "bg-danger/15";
}

function MonthCalendar({
  days,
  selectedDate,
  onSelect,
}: {
  days: DailyCompletenessRow[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  if (days.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nog geen dagen om te tonen deze maand.
      </p>
    );
  }

  // Maandagindex (0 = maandag ... 6 = zondag) van de eerste dag, voor lege
  // opvulcellen vooraan het rooster — Nederlandse weekindeling (week begint
  // op maandag), niet de Amerikaanse zondag-eerst-indeling.
  const firstWeekday = (new Date(`${days[0]!.localDate}T12:00:00Z`).getUTCDay() + 6) % 7;
  const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => i);

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {["ma", "di", "wo", "do", "vr", "za", "zo"].map((label) => (
        <div key={label} className="text-muted-foreground pb-1 text-center text-xs font-medium">
          {label}
        </div>
      ))}
      {leadingBlanks.map((i) => (
        <div key={`blank-${i}`} />
      ))}
      {days.map((day) => {
        const dayNumber = Number(day.localDate.slice(8, 10));
        const isSelected = selectedDate === day.localDate;
        return (
          <button
            key={day.localDate}
            type="button"
            onClick={() => onSelect(day.localDate)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-xs transition-colors",
              coverageBgClass(day.coveragePct, day.dayEnded),
              isSelected ? "border-primary" : "border-border/60 hover:border-border",
            )}
          >
            <span className="text-foreground font-medium">{dayNumber}</span>
            <span className="text-muted-foreground">
              {day.coveragePct === null ? "–" : `${day.coveragePct}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MissingIntervalsPanel({
  stationSlug,
  date,
}: {
  stationSlug: string;
  date: string;
}) {
  const [detail, setDetail] = useState<MissingIntervalsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function load() {
      setDetail(null);
      setFailed(false);
      fetch(
        `/api/weather/data-quality/missing-intervals?date=${date}&stationSlug=${encodeURIComponent(stationSlug)}`,
        { cache: "no-store" },
      )
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<MissingIntervalsResponse>;
        })
        .then((json) => {
          if (!cancelled) setDetail(json);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [date, stationSlug]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ontbrekende intervallen — {date}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!detail && !failed && <p className="text-muted-foreground text-sm">Laden…</p>}
        {failed && (
          <p className="text-muted-foreground text-sm">Kon ontbrekende intervallen niet laden.</p>
        )}
        {detail && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {detail.received} van {detail.expected} verwachte metingen ontvangen (
              {detail.coveragePct === null ? "–" : `${detail.coveragePct}%`}) —{" "}
              {detail.missingIntervals.length === 0
                ? "geen ontbrekende intervallen gevonden."
                : `${detail.missingIntervals.length} ontbrekend(e) interval(len).`}
            </p>
            {detail.missingIntervals.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-xs">
                    <th className="pr-4 pb-2 font-medium">Vanaf</th>
                    <th className="pr-4 pb-2 font-medium">Tot</th>
                    <th className="pb-2 font-medium">Geschat aantal gemist</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.missingIntervals.map((interval) => (
                    <tr
                      key={interval.fromExclusiveUtc}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="text-foreground py-1.5 pr-4">
                        {formatLocalTime(new Date(interval.fromExclusiveUtc))}
                      </td>
                      <td className="text-foreground py-1.5 pr-4">
                        {formatLocalTime(new Date(interval.toExclusiveUtc))}
                      </td>
                      <td className="text-foreground py-1.5">{interval.missingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function DataQualityExplorer({ stationSlug }: { stationSlug: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      setData(null);
      setLoadFailed(false);
      setSelectedDate(null);
      fetch(
        `/api/weather/data-quality?year=${year}&month=${month}&stationSlug=${encodeURIComponent(stationSlug)}`,
        { cache: "no-store" },
      )
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<DataQualityResponse>;
        })
        .then((json) => {
          if (!cancelled) setData(json);
        })
        .catch(() => {
          if (!cancelled) setLoadFailed(true);
        });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [year, month, stationSlug]);

  const statusOrder = ["received", "normalized", "partial", "failed", "duplicate"];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const next = shiftMonth(year, month, -1);
            setYear(next.year);
            setMonth(next.month);
          }}
          className="border-border hover:bg-accent text-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Vorige maand
        </button>
        <span className="text-foreground text-lg font-semibold">
          {shortMonthNameNl(month)} {year}
        </span>
        <button
          type="button"
          onClick={() => {
            const next = shiftMonth(year, month, 1);
            setYear(next.year);
            setMonth(next.month);
          }}
          disabled={year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)}
          className="border-border hover:bg-accent text-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Volgende maand
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loadFailed && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Kon datakwaliteitscijfers niet laden.
        </p>
      )}

      {!data && !loadFailed && (
        <p className="text-muted-foreground py-8 text-center text-sm">Laden…</p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Volledigheidskalender</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <MonthCalendar
                days={data.days}
                selectedDate={selectedDate}
                onSelect={(date) => setSelectedDate(date === selectedDate ? null : date)}
              />
              <p className="text-muted-foreground mt-3 text-xs">
                Gebaseerd op het huidige pollritme van {data.pollIntervalSeconds} seconden
                (~{Math.round(86400 / data.pollIntervalSeconds)} metingen per volledige dag).
                Klik op een dag voor de ontbrekende intervallen.
              </p>
            </CardContent>
          </Card>

          {selectedDate && (
            <MissingIntervalsPanel stationSlug={stationSlug} date={selectedDate} />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Volledigheid per dag</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {data.days.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Nog geen dagen deze maand.
                </p>
              ) : (
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-border text-muted-foreground border-b text-xs">
                      <th className="pr-4 pb-2 font-medium">Datum</th>
                      <th className="pr-4 pb-2 font-medium">Verwacht</th>
                      <th className="pr-4 pb-2 font-medium">Ontvangen</th>
                      <th className="pr-4 pb-2 font-medium">Ontbrekend</th>
                      <th className="pb-2 font-medium">Compleet %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((day) => (
                      <tr
                        key={day.localDate}
                        onClick={() => setSelectedDate(day.localDate === selectedDate ? null : day.localDate)}
                        className={cn(
                          "border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0",
                          selectedDate === day.localDate && "bg-accent/30",
                        )}
                      >
                        <td className="text-foreground py-1.5 pr-4">{day.localDate}</td>
                        <td className="text-foreground py-1.5 pr-4">{day.expected}</td>
                        <td className="text-foreground py-1.5 pr-4">{day.received}</td>
                        <td className="text-foreground py-1.5 pr-4">{day.missing}</td>
                        <td className="py-1.5">
                          <Badge variant={coverageVariant(day.coveragePct, day.dayEnded)}>
                            {day.coveragePct === null ? "–" : `${day.coveragePct}%`}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pakket- en parserstatus deze maand</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-0">
              {statusOrder.map((status) => (
                <Badge key={status} variant={STATUS_VARIANT[status] ?? "default"}>
                  {STATUS_LABEL_NL[status] ?? status}: {data.periodStats.packetStatusCounts[status] ?? 0}
                </Badge>
              ))}
              <Badge variant={data.periodStats.suspectObservationCount > 0 ? "warning" : "default"}>
                Verdachte metingen: {data.periodStats.suspectObservationCount}
              </Badge>
              <Badge variant={data.periodStats.unknownFieldsPacketCount > 0 ? "warning" : "default"}>
                Pakketten met onbekende velden: {data.periodStats.unknownFieldsPacketCount}
              </Badge>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
