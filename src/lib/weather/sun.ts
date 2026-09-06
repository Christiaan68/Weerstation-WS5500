/**
 * Zonsstand-berekeningen (zonsopkomst/zonsondergang/zonshoogte) — puur
 * wiskundig, GEEN externe API of extra dependency. Gebruikt de bekende
 * NOAA-benadering (zelfde formules als https://gml.noaa.gov/grad/solcalc/,
 * publiek beschreven astronomische standaardformules), nauwkeurig genoeg
 * (~1 minuut) voor het doel hier: het dashboard laten weten of het nu dag,
 * nacht, of golden hour is, voor de atmosferische achtergrond
 * (`src/lib/weather/condition.ts`). Geen vervanging voor een echte
 * astronomische bibliotheek en niet bedoeld voor navigatie/wetenschappelijk
 * gebruik.
 *
 * We rekenen bewust rechtstreeks in UTC (geen tijdzone-conversie nodig): de
 * formules geven de UTC-tijd van zonsopkomst/-ondergang terug zodra je de
 * lengtegraad meegeeft, zie de toelichting bij `getSunTimes()`.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Standaardcoördinaten (De Bilt, KNMI-referentiepunt) — gebruikt wanneer het
 * station geen `latitude`/`longitude` heeft ingesteld (zie `stations`-tabel).
 * Het verschil in zonstijden binnen heel Nederland is hooguit enkele
 * minuten, ruim voldoende nauwkeurig voor de dagdeel-/scene-bepaling.
 */
export const DEFAULT_LATITUDE = 52.11;
export const DEFAULT_LONGITUDE = 5.18;

/** Dag-van-het-jaar (1-366) in UTC. */
function utcDayOfYear(date: Date): number {
  const startOfYearUtc = Date.UTC(date.getUTCFullYear(), 0, 1);
  const diffDays = Math.floor((date.getTime() - startOfYearUtc) / 86_400_000);
  return diffDays + 1;
}

/** Fractie van het uur in UTC (0–24, met decimalen voor minuten/seconden). */
function utcFractionalHour(date: Date): number {
  return (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000) / 3600
  );
}

interface SolarParams {
  /** "Fractional year" in radialen — basis voor de eq.-of-time/declinatie-reeksontwikkeling. */
  gamma: number;
  /** Equation of time in minuten. */
  equationOfTimeMin: number;
  /** Zonsdeclinatie in radialen. */
  declinationRad: number;
}

function computeSolarParams(date: Date): SolarParams {
  const dayOfYear = utcDayOfYear(date);
  const hour = utcFractionalHour(date);
  const daysInYear = new Date(Date.UTC(date.getUTCFullYear(), 11, 31)).getUTCDate() === 31 &&
    date.getUTCFullYear() % 4 === 0 &&
    (date.getUTCFullYear() % 100 !== 0 || date.getUTCFullYear() % 400 === 0)
    ? 366
    : 365;

  const gamma = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (hour - 12) / 24);

  const equationOfTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const declinationRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  return { gamma, equationOfTimeMin, declinationRad };
}

/**
 * Zonshoogte ("solar elevation") in graden op een gegeven moment en
 * locatie: negatief = zon onder de horizon, 0 = precies op de horizon,
 * 90 = recht boven het hoofd. Basis voor de helder/bewolkt-inschatting in
 * `condition.ts` (vergelijking met de theoretische heldere-hemel-straling).
 */
export function getSolarElevationDeg(
  date: Date,
  latitude: number,
  longitude: number,
): number {
  const { equationOfTimeMin, declinationRad } = computeSolarParams(date);
  const hour = utcFractionalHour(date);

  // "True solar time" in minuten sinds middernacht UTC, gecorrigeerd voor
  // lengtegraad (4 minuten per graad) en de equation of time.
  const trueSolarTimeMin = hour * 60 + 4 * longitude + equationOfTimeMin;
  const hourAngleDeg = trueSolarTimeMin / 4 - 180;
  const hourAngleRad = hourAngleDeg * DEG_TO_RAD;
  const latRad = latitude * DEG_TO_RAD;

  const cosZenith =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  return 90 - zenithRad * RAD_TO_DEG;
}

export interface SunTimes {
  sunriseUtc: Date;
  sunsetUtc: Date;
  solarNoonUtc: Date;
}

/**
 * Zonsopkomst/zonsondergang/zonnemiddag (UTC) voor de UTC-kalenderdag van
 * `date`, op de opgegeven locatie. Zenith 90,833° is de gangbare standaard
 * (houdt rekening met atmosferische refractie + de schijfgrootte van de
 * zon — "zonsopkomst" is het moment waarop de bovenrand zichtbaar wordt,
 * niet het middelpunt).
 *
 * Geeft `null` terug in het (voor Nederland nooit voorkomende) geval van
 * poolnacht/-dag, waarbij de zon de horizon die dag niet kruist.
 */
export function getSunTimes(
  date: Date,
  latitude: number,
  longitude: number,
): SunTimes | null {
  // Bereken op basis van lokale-dag-middernacht UTC-equivalent: we gebruiken
  // 12:00 UTC van dezelfde kalenderdag als ijkpunt voor de eq.-of-time/
  // declinatie (die nauwelijks verandert binnen één dag), en itereren daarna
  // niet verder — dat is de standaard NOAA-vereenvoudiging.
  const noon = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
  );
  const { equationOfTimeMin, declinationRad } = computeSolarParams(noon);
  const latRad = latitude * DEG_TO_RAD;
  const zenithRad = 90.833 * DEG_TO_RAD;

  const cosHourAngle =
    Math.cos(zenithRad) / (Math.cos(latRad) * Math.cos(declinationRad)) -
    Math.tan(latRad) * Math.tan(declinationRad);

  if (cosHourAngle > 1 || cosHourAngle < -1) {
    // Poolnacht (>1, zon komt niet op) of poolddag (<-1, zon gaat niet onder).
    return null;
  }

  const hourAngleDeg = Math.acos(cosHourAngle) * RAD_TO_DEG;
  const dayStartUtcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );

  const solarNoonMin = 720 - 4 * longitude - equationOfTimeMin;
  const sunriseMin = solarNoonMin - 4 * hourAngleDeg;
  const sunsetMin = solarNoonMin + 4 * hourAngleDeg;

  return {
    sunriseUtc: new Date(dayStartUtcMs + sunriseMin * 60_000),
    solarNoonUtc: new Date(dayStartUtcMs + solarNoonMin * 60_000),
    sunsetUtc: new Date(dayStartUtcMs + sunsetMin * 60_000),
  };
}
