import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Sun,
} from "lucide-react";
import type { ComponentType } from "react";

import {
  describeWeatherCode,
  fetchForecast,
  type ForecastDay,
  type ForecastIcon,
} from "@/lib/weather/forecast";
import { cn } from "@/lib/utils";

const ICONS: Record<ForecastIcon, { Icon: ComponentType<{ className?: string }>; tone: string }> =
  {
    sun: { Icon: Sun, tone: "text-amber-500" },
    "cloud-sun": { Icon: CloudSun, tone: "text-amber-500" },
    cloud: { Icon: Cloud, tone: "text-slate-500 dark:text-slate-400" },
    fog: { Icon: CloudFog, tone: "text-slate-500 dark:text-slate-400" },
    drizzle: { Icon: CloudDrizzle, tone: "text-sky-500" },
    rain: { Icon: CloudRain, tone: "text-sky-600 dark:text-sky-400" },
    snow: { Icon: CloudSnow, tone: "text-cyan-500" },
    lightning: { Icon: CloudLightning, tone: "text-violet-500" },
  };

/** "Vandaag", "Morgen", daarna bv. "do 8 okt" — de datum is al een lokale dag (geen tijdzone-omrekening). */
function dayLabel(date: string, index: number): string {
  if (index === 0) return "Vandaag";
  if (index === 1) return "Morgen";
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatTemperature(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}°`;
}

function SectionHeader({ locationName }: { locationName: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        Verwachting — 5 dagen
      </h2>
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {locationName}
      </p>
    </div>
  );
}

function ForecastList({ days }: { days: ForecastDay[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:gap-3">
      {days.map((day, index) => {
        const info = describeWeatherCode(day.weatherCode);
        const { Icon, tone } = ICONS[info.icon];
        return (
          <li
            key={day.date}
            className="border-border bg-card flex items-center gap-3 rounded-xl border px-3 py-2.5 shadow-sm sm:flex-col sm:gap-1.5 sm:px-2 sm:py-4 sm:text-center"
          >
            <p className="text-foreground w-[4.5rem] shrink-0 text-sm font-medium sm:w-auto">
              {dayLabel(day.date, index)}
            </p>
            <Icon className={cn("h-7 w-7 shrink-0 sm:h-9 sm:w-9", tone)} aria-hidden="true" />
            <p className="text-muted-foreground min-w-0 flex-1 text-xs sm:flex-none">
              {info.label}
            </p>
            <p className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
              <span className="sr-only">Maximaal </span>
              {formatTemperature(day.maxC)}
              <span className="text-muted-foreground font-normal">
                <span className="sr-only"> minimaal </span>
                <span aria-hidden="true"> / </span>
                {formatTemperature(day.minC)}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 5-daagse verwachting (weertype + max/min per dag) voor de locatie van het
 * station. Server component: de Open-Meteo-aanroep (zie `fetchForecast`) loopt
 * server-side en wordt 30 minuten gecachet. Een fout of time-out laat de rest
 * van het dashboard onaangetast — er verschijnt dan alleen een korte melding.
 */
export async function ForecastCard({
  latitude,
  longitude,
  timeZone,
  locationName,
}: {
  latitude: number;
  longitude: number;
  timeZone: string;
  locationName: string;
}) {
  let days: ForecastDay[] = [];
  try {
    days = await fetchForecast(latitude, longitude, timeZone);
  } catch (error) {
    console.error(
      "[dashboard/verwachting] ophalen mislukt:",
      error instanceof Error ? error.message : "onbekende fout",
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Weersverwachting 5 dagen">
      <SectionHeader locationName={locationName} />
      {days.length === 0 ? (
        <p className="text-muted-foreground border-border bg-card rounded-xl border px-4 py-6 text-center text-sm">
          De verwachting is tijdelijk niet beschikbaar.
        </p>
      ) : (
        <ForecastList days={days} />
      )}
      <p className="text-muted-foreground text-[11px]">
        Verwachting:{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Open-Meteo.com
        </a>
      </p>
    </section>
  );
}

/** Plaatshouder terwijl de verwachting laadt (voorkomt dat de pagina eronder verspringt). */
export function ForecastSkeleton({ locationName }: { locationName: string }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Weersverwachting laden">
      <SectionHeader locationName={locationName} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="border-border bg-card h-12 animate-pulse rounded-xl border sm:h-36"
          />
        ))}
      </div>
    </section>
  );
}
