"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, Download } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { degreesToCompass } from "@/lib/weather/units";
import {
  EXPORT_METRIC_COLUMNS,
  getExportColumn,
  type ExportColumnDef,
} from "@/lib/weather/export/columns";
import { formatLocalDateTime } from "@/lib/weather/timezone";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ObservationRow {
  id: number;
  measuredAt: string;
  qualityStatus: string;
  source: string | null;
  [metricKey: string]: string | number | null;
}

interface ObservationsResponse {
  rows: ObservationRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface ObservationDetailResponse {
  observation: ObservationRow & { receivedAt: string; qualityFlags: unknown };
  rawPacketId: number | null;
  source: string | null;
  sensorMeasurements: Array<{
    id: number;
    sensorType: string;
    channel: number | null;
    metric: string;
    valueNumeric: string | null;
    valueText: string | null;
    unit: string | null;
  }>;
}

const PAGE_SIZE = 50;
const COLUMNS_STORAGE_KEY = "weerstation:data-explorer:columns";
const DEFAULT_COLUMN_KEYS = [
  "temperatureOutdoorC",
  "humidityOutdoorPct",
  "pressureRelativeHpa",
  "windSpeedKmh",
  "windGustKmh",
  "rainDayMm",
];

const SORT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "measuredAt", label: "Tijdstip" },
  { key: "temperatureOutdoorC", label: "Temperatuur" },
  { key: "windGustKmh", label: "Windstoot" },
  { key: "windSpeedKmh", label: "Windsnelheid" },
  { key: "rainRateMmH", label: "Regenintensiteit" },
  { key: "pressureRelativeHpa", label: "Luchtdruk" },
  { key: "humidityOutdoorPct", label: "Luchtvochtigheid" },
];

const QUALITY_OPTIONS = [
  { value: "", label: "Alle kwaliteit" },
  { value: "ok", label: "OK" },
  { value: "estimated", label: "Geschat" },
  { value: "suspect", label: "Verdacht" },
  { value: "missing", label: "Ontbreekt" },
];

const QUALITY_BADGE: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  ok: { label: "OK", variant: "success" },
  estimated: { label: "Geschat", variant: "warning" },
  suspect: { label: "Verdacht", variant: "danger" },
  missing: { label: "Ontbreekt", variant: "default" },
};

function loadStoredColumns(): string[] {
  if (typeof window === "undefined") return DEFAULT_COLUMN_KEYS;
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_KEYS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_COLUMN_KEYS;
    const valid = parsed.filter(
      (key): key is string => typeof key === "string" && Boolean(getExportColumn(key)),
    );
    return valid.length > 0 ? valid : DEFAULT_COLUMN_KEYS;
  } catch {
    // Privé browsen, opslag geblokkeerd, of corrupte data — val terug op de
    // standaardkolommen; dit mag de pagina nooit laten crashen.
    return DEFAULT_COLUMN_KEYS;
  }
}

function formatColumnValue(column: ExportColumnDef, row: ObservationRow): string {
  if (column.key === "windDirectionCompass") {
    const deg = row.windDirectionDeg;
    return typeof deg === "number" ? degreesToCompass(deg) : "–";
  }
  const raw = row[column.key];
  if (raw === null || raw === undefined || raw === "") return "–";
  if (column.kind === "number") return `${raw}${column.unit ? ` ${column.unit}` : ""}`;
  return String(raw);
}

function buildCsvHref(params: {
  stationSlug: string;
  fromDate: string;
  toDate: string;
  source: string;
  columnKeys: string[];
}): string {
  const search = new URLSearchParams();
  // Fase 5: expliciet het GESELECTEERDE station meesturen — anders valt de
  // export-route terug op het standaardstation, wat bij meerdere stations
  // een export van de verkeerde databron zou opleveren.
  search.set("station", params.stationSlug);
  if (params.fromDate && params.toDate) {
    search.set("preset", "aangepast");
    search.set("from", params.fromDate);
    search.set("to", params.toDate);
  } else {
    search.set("preset", "laatste-30-dagen");
  }
  if (params.source) search.set("source", params.source);
  if (params.columnKeys.length > 0) search.set("metrics", params.columnKeys.join(","));
  return `/api/weather/export/csv?${search.toString()}`;
}

// ---------------------------------------------------------------------------
// Kolomkiezer
// ---------------------------------------------------------------------------

function ColumnPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="border-border bg-background text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors"
      >
        <Columns3 className="h-4 w-4" aria-hidden="true" />
        Kolommen ({selected.length})
      </button>
      {open && (
        <>
          {/* Onzichtbare achtergrondlaag om het paneel te sluiten bij een klik ernaast. */}
          <button
            type="button"
            aria-label="Sluit kolomkiezer"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="border-border bg-card absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border p-2 shadow-lg">
            <p className="text-muted-foreground px-2 pb-1.5 text-xs font-medium">
              Zichtbare kolommen — je keuze wordt onthouden in deze browser.
            </p>
            {EXPORT_METRIC_COLUMNS.map((col) => {
              const checked = selected.includes(col.key);
              return (
                <label
                  key={col.key}
                  className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onChange(
                        checked
                          ? selected.filter((k) => k !== col.key)
                          : [...selected, col.key],
                      );
                    }}
                    className="accent-primary"
                  />
                  <span className="text-foreground">
                    {col.labelNl}
                    {col.unit && (
                      <span className="text-muted-foreground"> ({col.unit})</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Observatiedetail
// ---------------------------------------------------------------------------

function ObservationDetailPanel({
  observationId,
  stationSlug,
  colSpan,
}: {
  observationId: number;
  stationSlug: string;
  colSpan: number;
}) {
  const [detail, setDetail] = useState<ObservationDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function load() {
      setDetail(null);
      setFailed(false);
      fetch(`/api/weather/observations/${observationId}?station=${encodeURIComponent(stationSlug)}`, {
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<ObservationDetailResponse>;
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
  }, [observationId, stationSlug]);

  return (
    <tr className="bg-accent/20">
      <td colSpan={colSpan} className="p-4">
        {!detail && !failed && (
          <p className="text-muted-foreground text-sm">Detail laden…</p>
        )}
        {failed && <p className="text-muted-foreground text-sm">Kon detail niet laden.</p>}
        {detail && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">Lokale meettijd</p>
                <p className="text-foreground font-medium">
                  {formatLocalDateTime(new Date(detail.observation.measuredAt))}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">UTC-meettijd</p>
                <p className="text-foreground font-medium">
                  {new Date(detail.observation.measuredAt).toISOString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Ontvangsttijd</p>
                <p className="text-foreground font-medium">
                  {formatLocalDateTime(new Date(detail.observation.receivedAt))}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Bron</p>
                <p className="text-foreground font-medium">{detail.source ?? "–"}</p>
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                Alle genormaliseerde waarden
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                {EXPORT_METRIC_COLUMNS.map((col) => (
                  <div key={col.key} className="flex justify-between gap-2 sm:block">
                    <span className="text-muted-foreground">{col.labelNl}</span>{" "}
                    <span className="text-foreground font-medium">
                      {formatColumnValue(col, detail.observation)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                Extra sensormetingen
              </p>
              {detail.sensorMeasurements.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Geen extra sensormetingen bij deze meting (bv. bodemvocht, PM2.5) —
                  verschijnt hier automatisch zodra het station zulke sensoren levert.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.sensorMeasurements.map((sensor) => (
                    <li key={sensor.id} className="text-foreground">
                      {sensor.sensorType}
                      {sensor.channel !== null ? ` (kanaal ${sensor.channel})` : ""} —{" "}
                      {sensor.metric}: {sensor.valueNumeric ?? sensor.valueText ?? "–"}
                      {sensor.unit ? ` ${sensor.unit}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail.rawPacketId !== null && (
              <p className="text-muted-foreground text-xs">
                Ruw pakket #{detail.rawPacketId} — bekijk via de beveiligde diagnosepagina:{" "}
                <a
                  href={`/station/diagnostics/${detail.rawPacketId}`}
                  className="text-primary hover:underline"
                >
                  /station/diagnostics/{detail.rawPacketId}
                </a>{" "}
                (vereist <code>?key=…</code>, zie docs/AUTOMATIC_INGESTION.md).
              </p>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Hoofdcomponent
// ---------------------------------------------------------------------------

export function DataExplorer({
  stationSlug,
  sources,
}: {
  stationSlug: string;
  sources: string[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [source, setSource] = useState("");
  const [quality, setQuality] = useState("");
  const [sortBy, setSortBy] = useState("measuredAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ObservationsResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Kolomselectie: standaardwaarden op de server/eerste render (voorkomt een
  // hydratie-mismatch), pas ná mounten uit localStorage overschreven.
  const [columnKeys, setColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);
  useEffect(() => {
    function load() {
      setColumnKeys(loadStoredColumns());
    }
    load();
  }, []);

  function updateColumns(keys: string[]) {
    setColumnKeys(keys);
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(keys));
    } catch {
      // Opslag kan geblokkeerd zijn (privénavigatie) — de selectie werkt dan
      // gewoon binnen deze sessie, alleen niet blijvend onthouden.
    }
  }

  const columns = useMemo(
    () => columnKeys.map((key) => getExportColumn(key)).filter((c): c is ExportColumnDef => !!c),
    [columnKeys],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setData(null);
      setLoadFailed(false);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          station: stationSlug,
          sortBy,
          sortDir,
        });
        if (fromDate) params.set("from", new Date(`${fromDate}T00:00:00`).toISOString());
        if (toDate) params.set("to", new Date(`${toDate}T23:59:59.999`).toISOString());
        if (source) params.set("source", source);
        if (quality) params.set("quality", quality);

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
  }, [stationSlug, fromDate, toDate, source, quality, sortBy, sortDir, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasActiveFilter = Boolean(fromDate || toDate || source || quality);

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setSource("");
    setQuality("");
    setPage(1);
  }

  const csvHref = buildCsvHref({
    stationSlug,
    fromDate,
    toDate,
    source,
    columnKeys,
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
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
          {/* Alleen tonen zodra er meer dan één bron is — met precies één
              mogelijke waarde (bv. altijd "ecowitt_cloud_api") heeft filteren
              geen enkel effect en is de keuzelijst pure ruis. Verschijnt
              vanzelf weer zodra een station ooit via een 2e route
              (bv. "ecowitt_push") data binnenkrijgt. */}
          {sources.length > 1 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs font-medium">Bron</span>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
                className="border-border bg-background text-foreground rounded-md border px-2.5 py-1.5 text-sm"
              >
                <option value="">Alle bronnen</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">Kwaliteit</span>
            <select
              value={quality}
              onChange={(e) => {
                setQuality(e.target.value);
                setPage(1);
              }}
              className="border-border bg-background text-foreground rounded-md border px-2.5 py-1.5 text-sm"
            >
              {QUALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">Sorteer op</span>
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border-border bg-background text-foreground rounded-md border px-2.5 py-1.5 text-sm"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                aria-label={sortDir === "asc" ? "Oplopend gesorteerd" : "Aflopend gesorteerd"}
                className="border-border hover:bg-accent text-foreground rounded-md border px-2 py-1.5"
              >
                {sortDir === "asc" ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </label>

          <ColumnPicker selected={columnKeys} onChange={updateColumns} />

          <a
            href={csvHref}
            className="border-border bg-background text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download CSV
          </a>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
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
                    {columns.map((col) => (
                      <th key={col.key} className="pr-4 pb-2 font-medium whitespace-nowrap">
                        {col.labelNl}
                        {col.unit && <span className="opacity-70"> ({col.unit})</span>}
                      </th>
                    ))}
                    <th className="pb-2 font-medium">Kwaliteit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const badge = QUALITY_BADGE[row.qualityStatus] ?? QUALITY_BADGE.ok!;
                    const isExpanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className={cn(
                            "border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0",
                            isExpanded && "bg-accent/30",
                          )}
                        >
                          <td className="text-foreground py-2 pr-4 whitespace-nowrap">
                            {formatLocalDateTime(new Date(row.measuredAt))}
                          </td>
                          {columns.map((col) => (
                            <td key={col.key} className="text-foreground py-2 pr-4 whitespace-nowrap">
                              {formatColumnValue(col, row)}
                            </td>
                          ))}
                          <td className="py-2">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </td>
                        </tr>
                        {isExpanded && (
                          <ObservationDetailPanel
                            observationId={row.id}
                            stationSlug={stationSlug}
                            colSpan={columns.length + 2}
                          />
                        )}
                      </Fragment>
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
