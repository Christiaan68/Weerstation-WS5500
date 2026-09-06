/**
 * Bepaalt de "scene" voor de dashboard-hero (atmosferische achtergrond +
 * weersconditie-label). Uitsluitend afgeleid uit data die het station al
 * levert (regenintensiteit, temperatuur, luchtvochtigheid, dauwpunt,
 * zonnestraling) plus de zonsstand (`sun.ts`) — GEEN nieuwe databron, geen
 * externe weer-API.
 *
 * Bewust NIET ondersteund: "onweer" (geen bliksemsensor op dit station, dus
 * geen betrouwbare basis om dit te onderscheiden van gewone zware regen).
 *
 * Dit is een eenvoudige, transparante heuristiek (geen gevalideerde
 * meteorologische classificatie): puur voor de visuele presentatie, niet
 * voor records/statistieken elders in de app.
 */
import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE, getSolarElevationDeg, getSunTimes } from "@/lib/weather/sun";

export const WEATHER_SCENES = [
  "helder",
  "half-bewolkt",
  "bewolkt",
  "mist",
  "regen",
  "zware-regen",
  "sneeuw",
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
 * Vanaf welke regenintensiteit (mm/u) "regen" plaatsmaakt voor "zware regen".
 * Geen officiële KNMI-drempel — een grove, herkenbare knip tussen "motregen/
 * bui" en "stevige bui" voor de visuele presentatie.
 */
const HEAVY_RAIN_SCENE_THRESHOLD_MM_H = 7.5;

/**
 * Temperatuurgrens waaronder neerslag als "sneeuw" getoond wordt i.p.v.
 * regen. Ruwe vuistregel (geen fasovergangsmodel) — en de kanttekening dat
 * de regenmeter van dit station een kantelbakje is, dat sneeuw structureel
 * onderschat/mist. Sneeuw zal dus zelden in beeld komen, ook als het echt
 * sneeuwt.
 */
const SNOW_TEMPERATURE_THRESHOLD_C = 1.0;

/**
 * Mist-detectie via dauwpuntspreiding: hoe dichter de temperatuur bij het
 * dauwpunt ligt bij hoge luchtvochtigheid, hoe waarschijnlijker mist. Dit is
 * een gangbare, in de meteorologie veelgebruikte vuistregel — geen directe
 * zichtmeting (die heeft dit station niet), dus een benadering.
 */
const MIST_HUMIDITY_THRESHOLD_PCT = 95;
const MIST_DEWPOINT_SPREAD_MAX_C = 1.0;

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
  /** Actuele buitentemperatuur in °C, `null` als onbekend — voor de regen/sneeuw-knip. */
  temperatureOutdoorC: number | null;
  /** Actuele relatieve luchtvochtigheid buiten in %, `null` als onbekend — voor mistdetectie. */
  humidityOutdoorPct: number | null;
  /** Actueel dauwpunt in °C zoals door het station zelf berekend, `null` als onbekend. */
  dewPointC: number | null;
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
  "half-bewolkt": "Gedeeltelijk bewolkt",
  bewolkt: "Bewolkt",
  mist: "Mist",
  regen: "Regen",
  "zware-regen": "Zware regen",
  sneeuw: "Sneeuw",
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
 * Bepaalt de volledige scene voor de dashboard-hero. Prioriteit (hoog naar
 * laag): neerslag (sneeuw > zware regen > regen — direct gemeten, wint dus
 * altijd) → mist (dauwpuntspreiding — ook direct gemeten) → dagdeel (nacht/
 * zonsopkomst/zonsondergang) → overdag zonder neerslag/mist: bewolkingsgraad
 * op basis van gemeten vs. verwachte zonnestraling.
 */
export function determineWeatherScene(input: ConditionInput): ConditionResult {
  const latitude = input.latitude ?? DEFAULT_LATITUDE;
  const longitude = input.longitude ?? DEFAULT_LONGITUDE;

  const sunTimes = getSunTimes(input.now, latitude, longitude);
  const daypart = determineDaypart(input.now, sunTimes);
  const solarElevationDeg = getSolarElevationDeg(input.now, latitude, longitude);

  const isRaining =
    input.rainRateMmH !== null && input.rainRateMmH >= RAIN_SCENE_THRESHOLD_MM_H;
  const isHeavyRain =
    isRaining &&
    input.rainRateMmH !== null &&
    input.rainRateMmH >= HEAVY_RAIN_SCENE_THRESHOLD_MM_H;
  const isSnowing =
    isRaining &&
    input.temperatureOutdoorC !== null &&
    input.temperatureOutdoorC <= SNOW_TEMPERATURE_THRESHOLD_C;
  const isMisty =
    !isRaining &&
    input.humidityOutdoorPct !== null &&
    input.humidityOutdoorPct >= MIST_HUMIDITY_THRESHOLD_PCT &&
    input.dewPointC !== null &&
    input.temperatureOutdoorC !== null &&
    input.temperatureOutdoorC - input.dewPointC <= MIST_DEWPOINT_SPREAD_MAX_C;

  let scene: WeatherScene;
  if (isSnowing) {
    scene = "sneeuw";
  } else if (isHeavyRain) {
    scene = "zware-regen";
  } else if (isRaining) {
    scene = "regen";
  } else if (isMisty) {
    scene = "mist";
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
    if (ratio >= 0.75) {
      scene = "helder";
    } else if (ratio >= 0.4) {
      scene = "half-bewolkt";
    } else {
      scene = "bewolkt";
    }
  }

  return {
    scene,
    daypart,
    solarElevationDeg,
    sunriseUtc: sunTimes?.sunriseUtc ?? null,
    sunsetUtc: sunTimes?.sunsetUtc ?? null,
  };
}
