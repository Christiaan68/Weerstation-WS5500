/**
 * Bepaalt de "scene" voor de dashboard-hero (atmosferische achtergrond +
 * weersconditie-label): helder, bewolkt, regen, zonsopkomst, zonsondergang
 * of nacht. Uitsluitend afgeleid uit data die het station al levert
 * (regenintensiteit, zonnestraling) plus de zonsstand (`sun.ts`) — GEEN
 * nieuwe databron, geen externe weer-API.
 *
 * Dit is bewust een eenvoudige, transparante heuristiek (geen gevalideerde
 * meteorologische bewolkingsgraad-classificatie): puur voor de visuele
 * presentatie, niet voor records/statistieken elders in de app.
 */
import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE, getSolarElevationDeg, getSunTimes } from "@/lib/weather/sun";

export const WEATHER_SCENES = [
  "helder",
  "bewolkt",
  "regen",
  "zonsopkomst",
  "zonsondergang",
  "nacht",
] as const;

export type WeatherScene = (typeof WEATHER_SCENES)[number];

export type Daypart = "nacht" | "zonsopkomst" | "dag" | "zonsondergang";

/** Hoe lang vóór/ná de exacte zonsopkomst/-ondergang de "golden hour"-scene duurt. */
const TWILIGHT_WINDOW_MS = 35 * 60_000;

/** Vanaf welke regenintensiteit (mm/u) de scene "regen" wordt, i.p.v. helder/bewolkt. */
const RAIN_SCENE_THRESHOLD_MM_H = 0.1;

/**
 * Ruwe schatting van de heldere-hemel-instraling (W/m²) bij een gegeven
 * zonshoogte — gebruikt als referentie om de gemeten zonnestraling tegen af
 * te zetten (veel lager dan verwacht ⇒ bewolkt). Geen gevalideerd
 * atmosfeermodel, enkel een grove, monotone benadering die voor de
 * relatieve vergelijking hier voldoet.
 */
function estimateClearSkyRadiationWm2(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  return 950 * Math.pow(Math.sin(elevationDeg * (Math.PI / 180)), 1.15);
}

export interface ConditionInput {
  /** Moment waarvoor de scene bepaald wordt — meestal "nu", injecteerbaar voor tests. */
  now: Date;
  /** Stationcoördinaten; `null` ⇒ terugvallen op `DEFAULT_LATITUDE/LONGITUDE` (De Bilt). */
  latitude: number | null;
  longitude: number | null;
  /** Actuele regenintensiteit in mm/u, `null` als onbekend. */
  rainRateMmH: number | null;
  /** Actuele zonnestraling in W/m², `null` als onbekend (bv. sensor levert 's nachts vaak niets). */
  solarRadiationWm2: number | null;
}

export interface ConditionResult {
  scene: WeatherScene;
  daypart: Daypart;
  /** Zonshoogte in graden op dit moment — handig voor UI-nuances (bv. gloed-intensiteit). */
  solarElevationDeg: number;
  sunriseUtc: Date | null;
  sunsetUtc: Date | null;
}

const SCENE_LABELS_NL: Record<WeatherScene, string> = {
  helder: "Helder",
  bewolkt: "Bewolkt",
  regen: "Regen",
  zonsopkomst: "Zonsopkomst",
  zonsondergang: "Zonsondergang",
  nacht: "Nacht",
};

export function weatherSceneLabelNl(scene: WeatherScene): string {
  return SCENE_LABELS_NL[scene];
}

function determineDaypart(now: Date, sunTimes: ReturnType<typeof getSunTimes>): Daypart {
  if (!sunTimes) return "dag"; // poolddag/-nacht komt in NL niet voor; veilige fallback.

  const nowMs = now.getTime();
  const sunriseMs = sunTimes.sunriseUtc.getTime();
  const sunsetMs = sunTimes.sunsetUtc.getTime();

  if (Math.abs(nowMs - sunriseMs) <= TWILIGHT_WINDOW_MS) return "zonsopkomst";
  if (Math.abs(nowMs - sunsetMs) <= TWILIGHT_WINDOW_MS) return "zonsondergang";
  if (nowMs > sunriseMs && nowMs < sunsetMs) return "dag";
  return "nacht";
}

/**
 * Bepaalt de volledige scene voor de dashboard-hero. Prioriteit: regen wint
 * altijd (ongeacht dagdeel), daarna dagdeel (nacht/zonsopkomst/
 * zonsondergang), en alleen overdag zonder regen wordt onderscheid gemaakt
 * tussen helder en bewolkt op basis van de gemeten vs. verwachte
 * zonnestraling.
 */
export function determineWeatherScene(input: ConditionInput): ConditionResult {
  const latitude = input.latitude ?? DEFAULT_LATITUDE;
  const longitude = input.longitude ?? DEFAULT_LONGITUDE;

  const sunTimes = getSunTimes(input.now, latitude, longitude);
  const daypart = determineDaypart(input.now, sunTimes);
  const solarElevationDeg = getSolarElevationDeg(input.now, latitude, longitude);

  const isRaining =
    input.rainRateMmH !== null && input.rainRateMmH >= RAIN_SCENE_THRESHOLD_MM_H;

  let scene: WeatherScene;
  if (isRaining) {
    scene = "regen";
  } else if (daypart === "nacht") {
    scene = "nacht";
  } else if (daypart === "zonsopkomst") {
    scene = "zonsopkomst";
  } else if (daypart === "zonsondergang") {
    scene = "zonsondergang";
  } else if (input.solarRadiationWm2 === null) {
    // Geen zonnestralingsmeting beschikbaar: geen betrouwbare basis om
    // bewolkt te concluderen — toon "helder" als neutrale standaard.
    scene = "helder";
  } else {
    const clearSky = estimateClearSkyRadiationWm2(solarElevationDeg);
    const isInconclusive = clearSky < 20; // zon te laag aan de hemel voor een zinnige vergelijking.
    const ratio = isInconclusive ? 1 : input.solarRadiationWm2 / clearSky;
    scene = ratio >= 0.6 ? "helder" : "bewolkt";
  }

  return {
    scene,
    daypart,
    solarElevationDeg,
    sunriseUtc: sunTimes?.sunriseUtc ?? null,
    sunsetUtc: sunTimes?.sunsetUtc ?? null,
  };
}
