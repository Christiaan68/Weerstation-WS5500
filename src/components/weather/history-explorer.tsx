"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/weather/timezone";

interface ObservationRow {
  id: number;
  measuredAt: string;
  temperatureOutdoorC: string | null;
  humidityOutdoorPct: string | null;
  pressureRelativeHpa: string | null;
  windSpeedKmh: string | null;
  windGustKmh: string | null;
  rainDayMm: string | null;
  qualityStatus: string;
}

interface ObservationsResponse {
  rows: ObservationRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

const QUALITY_BADGE: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  ok: { label: "OK", variant: "success" },
  estimated: { label: "Geschat", variant: "warning" },
  suspect: { label: "Verdacht", variant: "danger" },
  missing: { label: "Ontbreekt", variant: "default" },
};

function cell(value: string | null, unit: string): string {
  return value === null ? "–" : `${value}${unit}`;
}

export function HistoryExplorer({ stationSlug }: { stationSlug: string }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ObservationsResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          stationSlug,
        });
        if (fromDate) params.set("from", new Date(`${fromDate}T00:00:00`).toISOString());
        if (toDate) params.set("to", new Date(`${toDate}T23:59:59.999`).toISOString());

        const response = await fetch(`/api/weather/observations?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as ObservationsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [stationSlug, fromDate, toDate, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">Van</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="border-border bg-background text-foreground rounded-md border px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">Tot en met</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="border-border bg-background text-foreground rounded-md border px-2.5 py-1.5 text-sm"
            />
          </label>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setPage(1);
              }}
              className="text-primary text-sm font-medium hover:underline"
            >
              Filter wissen
            </button>
          )}
          {data && (
            <span className="text-muted-foreground ml-auto text-xs">
              {data.total.toLocaleString("nl-NL")} metingen gevonden
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          {data ? (
            data.rows.length > 0 ? (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-xs">
                    <th className="pr-4 pb-2 font-medium">Tijdstip</th>
                    <th className="pr-4 pb-2 font-medium">Temp.</th>
                    <th className="pr-4 pb-2 font-medium">Vocht.</th>
                    <th className="pr-4 pb-2 font-medium">Druk</th>
                    <th className="pr-4 pb-2 font-medium">Wind</th>
                    <th className="pr-4 pb-2 font-medium">Stoten</th>
                    <th className="pr-4 pb-2 font-medium">Regen</th>
                    <th className="pb-2 font-medium">Kwaliteit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const quality = QUALITY_BADGE[row.qualityStatus] ?? QUALITY_BADGE.ok!;
                    return (
                      <tr
                        key={row.id}
                        className="border-border/60 hover:bg-accent/40 border-b last:border-0"
                      >
                        <td className="text-foreground py-2 pr-4 whitespace-nowrap">
                          {formatLocalDateTime(new Date(row.measuredAt))}
                        </td>
                        <td className="text-foreground py-2 pr-4">
                          {cell(row.temperatureOutdoorC, " °C")}
                        </td>
                        <td className="text-foreground py-2 pr-4">
                          {cell(row.humidityOutdoorPct, " %")}
                        </td>
                        <td className="text-foreground py-2 pr-4">
                          {cell(row.pressureRelativeHpa, " hPa")}
                        </td>
                        <td className="text-foreground py-2 pr-4">
                          {cell(row.windSpeedKmh, " km/h")}
                        </td>
                        <td className="text-foreground py-2 pr-4">
                          {cell(row.windGustKmh, " km/h")}
                        </td>
                        <td className="text-foreground py-2 pr-4">
                          {cell(row.rainDayMm, " mm")}
                        </td>
                        <td className="py-2">
                          <Badge variant={quality.variant}>{quality.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-muted-foreground py-16 text-center text-sm">
                Geen metingen gevonden voor deze filter.
              </p>
            )
          ) : (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {loadFailed ? "Kon metingen niet laden." : "Laden…"}
            </p>
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            Pagina {data.page} van {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={cn(
                "border-border inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                page <= 1
                  ? "text-muted-foreground cursor-not-allowed opacity-50"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Vorige
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={cn(
                "border-border inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                page >= totalPages
                  ? "text-muted-foreground cursor-not-allowed opacity-50"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Volgende
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
