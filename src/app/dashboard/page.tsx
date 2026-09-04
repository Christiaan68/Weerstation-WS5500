import {
  CloudRain,
  Droplets,
  Gauge,
  Sun,
  Sunrise,
  Thermometer,
  Wind,
} from "lucide-react";
import type { Metadata } from "next";

import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getLatestObservation, getObservationCount, getStation } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";
import { degreesToCompass } from "@/lib/weather/units";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Actueel overzicht van temperatuur, wind, regen en meer.",
};

// Toont de meest recente meting; nooit statisch cachen.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const station = await getStation().catch(() => undefined);
  const observation = station
    ? await getLatestObservation(station.id).catch(() => undefined)
    : undefined;
  const observationCount = station
    ? await getObservationCount(station.id).catch(() => 0)
    : 0;

  const hasData = Boolean(observation);
  const showDemoBadge = hasData && publicEnv.NEXT_PUBLIC_DEMO_MODE;

  const windDirection =
    observation?.windDirectionDeg !== null && observation?.windDirectionDeg !== undefined
      ? degreesToCompass(observation.windDirectionDeg)
      : null;

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Dashboard"
        description={
          station
            ? `Actuele metingen van ${station.name}${
                observationCount > 0
                  ? ` · ${observationCount.toLocaleString("nl-NL")} metingen in de database`
                  : ""
              }`
            : "Er is nog geen station geconfigureerd."
        }
        action={
          showDemoBadge ? <Badge variant="warning">Demo-gegevens</Badge> : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          icon={Thermometer}
          label="Temperatuur"
          value={observation?.temperatureOutdoorC ?? null}
          unit="°C"
          secondaryLine={
            observation?.feelsLikeC
              ? `Gevoelstemperatuur ${observation.feelsLikeC} °C`
              : null
          }
        />
        <MetricCard
          icon={Droplets}
          label="Luchtvochtigheid"
          value={observation?.humidityOutdoorPct ?? null}
          unit="%"
        />
        <MetricCard
          icon={Gauge}
          label="Luchtdruk"
          value={observation?.pressureRelativeHpa ?? null}
          unit="hPa"
        />
        <MetricCard
          icon={Wind}
          label="Wind"
          value={observation?.windSpeedKmh ?? null}
          unit="km/h"
          secondaryLine={
            windDirection
              ? `Richting ${windDirection}${
                  observation?.windGustKmh
                    ? ` · Windstoten ${observation.windGustKmh} km/h`
                    : ""
                }`
              : null
          }
        />
        <MetricCard
          icon={CloudRain}
          label="Regen"
          value={observation?.rainDayMm ?? null}
          unit="mm"
          secondaryLine="Vandaag"
        />
        <MetricCard icon={Sun} label="UV" value={observation?.uvIndex ?? null} unit="" />
        <MetricCard
          icon={Sunrise}
          label="Zonnestraling"
          value={observation?.solarRadiationWm2 ?? null}
          unit="W/m²"
        />
      </div>
    </Container>
  );
}
