/**
 * Capability-laag (Fase 5, §35-38 / §57-58) — bepaalt WELKE sensoren een
 * station daadwerkelijk heeft, zodat de UI (Fase 5.2) een ontbrekende sensor
 * kan tonen als "—" / "Niet beschikbaar" in plaats van een foutmelding of —
 * erger — een verzonnen waarde (bv. "0 mm regen" voor een station zonder
 * regenmeter). Nooit hardcoded per model: elk Ecowitt-compatibel station kan
 * een andere sensor-uitrusting hebben dan de bestaande WS5500, dus de
 * capabilities worden altijd AFGELEID uit de daadwerkelijk ontvangen data.
 *
 * Twee databronnen:
 * - `weather_observations`: de vaste basiskolommen (temperatuur, wind,
 *   regen, UV, zon, luchtdruk) — capability = "heeft de meest recente
 *   meting voor dit veld een niet-null waarde?" (zie
 *   `deriveStationCapabilities()`).
 * - `sensor_measurements`: de generieke extra-sensor-tabel (bodemvocht,
 *   bliksem, extra temp-/vochtkanalen, fijnstof, ...) — capability = "komt
 *   dit `sensor_type` ooit voor bij dit station?" (zie
 *   `listDistinctSensorTypesForStation()` in `src/lib/db/queries.ts`, en de
 *   daadwerkelijke `sensorType`-strings die de parser schrijft in
 *   `src/lib/weather/ecowitt/fields.ts`).
 *
 * BEWUST GEEN "model X heeft altijd sensor Y"-opzoektabel: een gebruiker kan
 * een kanaal loskoppelen, en een gloednieuw station heeft aanvankelijk
 * helemaal geen metingen — in beide gevallen moet de UI "nog niet
 * beschikbaar" tonen, nooit een geraden/verzonnen capability.
 */
import { getLatestObservation, listDistinctSensorTypesForStation } from "@/lib/db/queries";
import type { WeatherObservation } from "@/lib/db/schema";

export interface StationCapabilities {
  hasOutdoorTemperature: boolean;
  hasIndoorTemperature: boolean;
  hasHumidityOutdoor: boolean;
  hasHumidityIndoor: boolean;
  hasWind: boolean;
  hasRain: boolean;
  hasUV: boolean;
  hasSolar: boolean;
  hasPressure: boolean;
  hasLightning: boolean;
  hasSoilMoisture: boolean;
  hasLeafWetness: boolean;
  hasAirQuality: boolean;
  hasWaterLeak: boolean;
  /** Overige extra `sensor_type`-waarden (bv. "extra_temperature", "battery") zonder eigen vlag hierboven — voor toekomstige/onbekende sensortypen. */
  extraSensorTypes: string[];
}

// `sensor_measurements.sensor_type`-waarden die aan een specifieke
// capability-vlag gekoppeld zijn — exact de strings die
// `src/lib/weather/ecowitt/fields.ts` daadwerkelijk schrijft, NOOIT geraden.
const LIGHTNING_SENSOR_TYPES = new Set(["lightning"]);
const SOIL_MOISTURE_SENSOR_TYPES = new Set(["soil_moisture"]);
const LEAF_WETNESS_SENSOR_TYPES = new Set(["leaf_wetness"]);
const AIR_QUALITY_SENSOR_TYPES = new Set(["pm25", "co2"]);
const WATER_LEAK_SENSOR_TYPES = new Set(["water_leak"]);

const KNOWN_SENSOR_TYPE_SETS = [
  LIGHTNING_SENSOR_TYPES,
  SOIL_MOISTURE_SENSOR_TYPES,
  LEAF_WETNESS_SENSOR_TYPES,
  AIR_QUALITY_SENSOR_TYPES,
  WATER_LEAK_SENSOR_TYPES,
];

function notNull(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function hasAnySensorType(sensorTypeSet: Set<string>, types: Set<string>): boolean {
  for (const type of types) {
    if (sensorTypeSet.has(type)) return true;
  }
  return false;
}

/**
 * Bouwt de volledige capability-set voor een station op basis van diens
 * meest recente meting (`observation` — `undefined` als er nog nooit
 * gemeten is: dan is elke basis-capability `false`, nooit geraden) en de set
 * `sensor_type`-waarden die ooit voor dit station zijn binnengekomen
 * (`sensorTypes`, uit `listDistinctSensorTypesForStation()`).
 *
 * Puur functioneel (geen database-toegang) — apart getest en herbruikbaar
 * zonder een echte database (zie `tests/weather-capabilities.test.ts`).
 */
export function deriveStationCapabilities(
  observation: WeatherObservation | undefined,
  sensorTypes: string[],
): StationCapabilities {
  const sensorTypeSet = new Set(sensorTypes);
  const knownSensorTypes = new Set(KNOWN_SENSOR_TYPE_SETS.flatMap((set) => [...set]));
  const extraSensorTypes = sensorTypes.filter((type) => !knownSensorTypes.has(type)).sort();

  return {
    hasOutdoorTemperature: notNull(observation?.temperatureOutdoorC),
    hasIndoorTemperature: notNull(observation?.temperatureIndoorC),
    hasHumidityOutdoor: notNull(observation?.humidityOutdoorPct),
    hasHumidityIndoor: notNull(observation?.humidityIndoorPct),
    // "Wind" telt als aanwezig zodra minstens één van snelheid/stoot/richting
    // een echte waarde heeft — sommige stations missen bv. windrichting maar
    // hebben wel windsnelheid.
    hasWind:
      notNull(observation?.windSpeedKmh) ||
      notNull(observation?.windGustKmh) ||
      notNull(observation?.windDirectionDeg),
    // "Regen" telt als aanwezig zodra minstens één regenveld een waarde
    // heeft — een station zonder regenmeter heeft ze allemaal `null`.
    hasRain:
      notNull(observation?.rainRateMmH) ||
      notNull(observation?.rainDayMm) ||
      notNull(observation?.rainTotalMm),
    hasUV: notNull(observation?.uvIndex),
    hasSolar: notNull(observation?.solarRadiationWm2),
    hasPressure:
      notNull(observation?.pressureAbsoluteHpa) || notNull(observation?.pressureRelativeHpa),
    hasLightning: hasAnySensorType(sensorTypeSet, LIGHTNING_SENSOR_TYPES),
    hasSoilMoisture: hasAnySensorType(sensorTypeSet, SOIL_MOISTURE_SENSOR_TYPES),
    hasLeafWetness: hasAnySensorType(sensorTypeSet, LEAF_WETNESS_SENSOR_TYPES),
    hasAirQuality: hasAnySensorType(sensorTypeSet, AIR_QUALITY_SENSOR_TYPES),
    hasWaterLeak: hasAnySensorType(sensorTypeSet, WATER_LEAK_SENSOR_TYPES),
    extraSensorTypes,
  };
}

/** Capability-set voor een station zonder metingen — alles `false`/leeg, nooit geraden. */
export const EMPTY_CAPABILITIES: StationCapabilities = deriveStationCapabilities(undefined, []);

/**
 * Gemakshelper voor server-componenten (Fase 5.2): haalt de meest recente
 * meting en de bekende `sensor_type`-waarden voor een station op en bouwt
 * daar in één keer de capabilities uit. Geeft `EMPTY_CAPABILITIES` terug
 * i.p.v. te gooien bij een databasefout — een capability-check mag de rest
 * van een pagina nooit laten crashen.
 */
export async function getStationCapabilities(stationId: number): Promise<StationCapabilities> {
  try {
    const [observation, sensorTypes] = await Promise.all([
      getLatestObservation(stationId),
      listDistinctSensorTypesForStation(stationId),
    ]);
    return deriveStationCapabilities(observation, sensorTypes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error(
      `[weather/capabilities] Kon capabilities voor station #${stationId} niet bepalen: ${message}`,
    );
    return EMPTY_CAPABILITIES;
  }
}
