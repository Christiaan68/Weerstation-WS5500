import {
  Cloud,
  CloudFog,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { WeatherSceneArt } from "@/components/weather/weather-scene-art";
import type { WeatherScene } from "@/lib/weather/condition";
import { weatherSceneLabelNl } from "@/lib/weather/condition";
import { cn } from "@/lib/utils";

const SCENE_ICON: Record<WeatherScene, LucideIcon> = {
  helder: Sun,
  "half-bewolkt": CloudSun,
  bewolkt: Cloud,
  mist: CloudFog,
  regen: CloudRain,
  "zware-regen": CloudRainWind,
  sneeuw: CloudSnow,
  zonsopkomst: Sunrise,
  zonsondergang: Sunset,
  nacht: Moon,
};

export interface WeatherHeroProps {
  scene: WeatherScene;
  stationName: string;
  observationCount: number;
  /** Ruwe, al geformatteerde decimale string uit de database (bv. "19.7"), zoals elders in de app. */
  temperatureOutdoorC: string | null;
  feelsLikeC: string | null;
  todayMinC: number | null;
  todayMaxC: number | null;
  lastCheckedLabel: string | null;
  isStale: boolean;
  showDemoBadge: boolean;
}

/**
 * De "beleef het weer"-laag van het dashboard: grote actuele temperatuur +
 * weersconditie tegen een atmosferische achtergrond die met de scene
 * meekleurt. De achtergrond bestaat uit drie lagen: een gradient
 * (`.weather-hero`, kleur via de `.weather-scene-*`-variabelen), een
 * gelaagde SVG-weerillustratie (`WeatherSceneArt` — zon/wolken/regen/
 * sneeuw/mist/sterren, deels afgesneden door de kaartrand) en een zachte
 * gloed die net buiten de kaart uitloopt (`.weather-hero-glow`) zodat de
 * sfeer niet als een strak ingelijst plaatje aanvoelt. Puur presentationeel
 * — alle data/berekeningen komen van buitenaf (`live-metrics.tsx`).
 */
export function WeatherHero({
  scene,
  stationName,
  observationCount,
  temperatureOutdoorC,
  feelsLikeC,
  todayMinC,
  todayMaxC,
  lastCheckedLabel,
  isStale,
  showDemoBadge,
}: WeatherHeroProps) {
  const Icon = SCENE_ICON[scene];

  return (
    <Container className="pt-6">
      <div className={cn("weather-hero-wrap", `weather-scene-${scene}`)}>
        <div className="weather-hero-glow" aria-hidden="true" />
        <div
          className={cn(
            "weather-hero",
            `weather-scene-${scene}`,
            "rounded-3xl px-6 py-10 shadow-lg sm:px-10 sm:py-14",
          )}
        >
          <WeatherSceneArt scene={scene} />
          <div className="weather-hero-scrim" aria-hidden="true" />

          <div className="relative z-[2] flex flex-col gap-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                <span>{stationName}</span>
                {observationCount > 0 && (
                  <span className="hidden text-white/50 sm:inline">
                    · {observationCount.toLocaleString("nl-NL")} metingen
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {showDemoBadge && <Badge variant="warning">Demo-gegevens</Badge>}
                {lastCheckedLabel && (
                  <span className="text-xs text-white/60">
                    {lastCheckedLabel}
                    {isStale && " · verversen mislukt"}
                  </span>
                )}
              </div>
            </div>

            {temperatureOutdoorC === null ? (
              <p className="text-white/80">Nog geen gegevens ontvangen.</p>
            ) : (
              <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <p className="text-[5.5rem] leading-[0.9] font-semibold tracking-tight sm:text-[7rem]">
                    {temperatureOutdoorC}
                    <span className="align-top text-4xl font-medium sm:text-5xl">°C</span>
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:items-end">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-md">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-base font-medium">{weatherSceneLabelNl(scene)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {feelsLikeC && (
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-md">
                        Voelt als {feelsLikeC}°
                      </span>
                    )}
                    {todayMinC !== null && todayMaxC !== null && (
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-md">
                        {todayMinC.toFixed(1)}° / {todayMaxC.toFixed(1)}°
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
