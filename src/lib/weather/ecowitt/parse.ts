/**
 * De Ecowitt-parser: zet een platte, ruwe payload (afkomstig van de
 * WS5500-push, de Wunderground-compatibele variant, óf de geflatten Ecowitt
 * Cloud API-respons — zie `src/lib/weather/providers/ecowitt-cloud.ts`) om
 * naar een `ParsedWeatherPacket`.
 *
 * Ontwerpprincipes (zie ook docs/WS5500_INGESTION.md):
 * - Nooit throwen op onbekende/rare input — in het slechtste geval komt er
 *   een `ParsedWeatherPacket` met `quality: "missing"` en een lege
 *   `observation` uit, nooit een uitzondering. De aanroeper (de ingestie-
 *   pijplijn) beslist wat er met dat resultaat gebeurt; de ruwe payload
 *   staat sowieso al veilig in `raw_weather_packets`.
 * - Elk veld wordt precies éénmaal geclassificeerd: metadata, hoofdmeting,
 *   kanaalgebonden sensor, overige sensor, of onbekend.
 * - Eenheidsconversie loopt uitsluitend via `src/lib/weather/units.ts` (geen
 *   losse conversieformules in dit bestand).
 */
import { fahrenheitToCelsius, inHgToHpa, inchToMm, mphToKmh } from "../units";
import { parseEcowittDateUtc } from "../timestamp";
import type {
  ParsedObservationFields,
  ParsedQualityStatus,
  ParsedSensorMeasurement,
  ParsedWeatherPacket,
  RawFieldValue,
  RawPayload,
} from "../types";
import {
  ALIAS_FIELDS,
  BOOLEAN_BATTERY_FIELDS,
  CHANNEL_FIELD_PATTERNS,
  DIRECT_OBSERVATION_FIELDS,
  EXTRA_SENSOR_DIRECT_FIELDS,
  METADATA_FIELDS,
  MISC_SENSOR_FIELDS,
  isWithinRange,
  toNumber,
} from "./fields";

/**
 * Versie van deze parser. Wordt opgeslagen op elk ruw pakket
 * (`raw_weather_packets.parser_version`) zodat `reprocessRawPacket()` later
 * kan zien met welke versie een pakket voor het laatst verwerkt is, en zodat
 * een toekomstige parserwijziging expliciet zichtbaar blijft in de data.
 * Ophogen bij elke betekenisvolle wijziging aan de veldherkenning/-mapping.
 */
export const PARSER_VERSION = "ecowitt-v1";

function applyDirectObservationField(
  key: string,
  value: number,
  observation: ParsedObservationFields,
): void {
  switch (key) {
    case "tempinf":
      observation.temperatureIndoorC = fahrenheitToCelsius(value);
      break;
    case "humidityin":
      observation.humidityIndoorPct = value;
      break;
    case "baromrelin":
      observation.pressureRelativeHpa = inHgToHpa(value);
      break;
    case "baromabsin":
      observation.pressureAbsoluteHpa = inHgToHpa(value);
      break;
    case "tempf":
      observation.temperatureOutdoorC = fahrenheitToCelsius(value);
      break;
    case "humidity":
      observation.humidityOutdoorPct = value;
      break;
    case "winddir":
      observation.windDirectionDeg = ((value % 360) + 360) % 360;
      break;
    case "windspeedmph":
      observation.windSpeedKmh = mphToKmh(value);
      break;
    case "windgustmph":
      observation.windGustKmh = mphToKmh(value);
      break;
    case "rainratein":
      observation.rainRateMmH = inchToMm(value);
      break;
    case "eventrainin":
      observation.rainEventMm = inchToMm(value);
      break;
    case "hourlyrainin":
      observation.rainHourMm = inchToMm(value);
      break;
    case "dailyrainin":
      observation.rainDayMm = inchToMm(value);
      break;
    case "weeklyrainin":
      observation.rainWeekMm = inchToMm(value);
      break;
    case "monthlyrainin":
      observation.rainMonthMm = inchToMm(value);
      break;
    case "yearlyrainin":
      observation.rainYearMm = inchToMm(value);
      break;
    case "totalrainin":
      observation.rainTotalMm = inchToMm(value);
      break;
    case "solarradiation":
      observation.solarRadiationWm2 = value;
      break;
    case "uv":
      observation.uvIndex = value;
      break;
    case "dewptf":
      observation.dewPointC = fahrenheitToCelsius(value);
      break;
    case "windchillf":
      observation.windChillC = fahrenheitToCelsius(value);
      break;
    case "heatindexf":
      observation.heatIndexC = fahrenheitToCelsius(value);
      break;
    case "feelslikef":
      observation.feelsLikeC = fahrenheitToCelsius(value);
      break;
    default:
      break;
  }
}

/** Vindt het eerste aanwezige veld uit een lijst kandidaatnamen (case-insensitief). */
function pickField(
  payload: RawPayload,
  lowerKeyMap: Map<string, string>,
  candidates: string[],
) {
  for (const candidate of candidates) {
    const originalKey = lowerKeyMap.get(candidate);
    if (originalKey !== undefined) {
      return payload[originalKey];
    }
  }
  return undefined;
}

export function parseEcowittPayload(
  rawPayload: RawPayload,
  options: { receivedAt: Date },
): ParsedWeatherPacket {
  const recognizedFields: string[] = [];
  const unknownFields: RawPayload = {};
  const warnings: string[] = [];
  const observation: ParsedObservationFields = {};
  const sensors: ParsedSensorMeasurement[] = [];

  const lowerKeyMap = new Map<string, string>();
  for (const key of Object.keys(rawPayload)) {
    // Bij een botsing (zeer onwaarschijnlijk, bv. zowel "PASSKEY" als
    // "passkey" in dezelfde payload) wint de eerst aangetroffen sleutel.
    const lower = key.toLowerCase();
    if (!lowerKeyMap.has(lower)) {
      lowerKeyMap.set(lower, key);
    }
  }

  const dateutcValue = pickField(rawPayload, lowerKeyMap, ["dateutc"]) as RawFieldValue;
  const timestamp = parseEcowittDateUtc(dateutcValue, options.receivedAt);
  if (timestamp.warning) {
    warnings.push(timestamp.warning);
  }

  for (const [rawKey, rawValue] of Object.entries(rawPayload)) {
    // Een alias (bv. de Wunderground-veldnaam "rainin") wordt behandeld als
    // zijn canonieke Ecowitt-tegenhanger ("hourlyrainin") voor het bepalen
    // van bereik/observatieveld — de oorspronkelijke naam blijft gebruikt in
    // meldingen en `recognizedFields`.
    const key = ALIAS_FIELDS[rawKey.toLowerCase()] ?? rawKey.toLowerCase();

    if (key === "dateutc" || METADATA_FIELDS.has(key)) {
      recognizedFields.push(rawKey);
      continue;
    }

    if ((DIRECT_OBSERVATION_FIELDS as readonly string[]).includes(key)) {
      recognizedFields.push(rawKey);
      const num = toNumber(rawValue);
      if (num === undefined) {
        warnings.push(
          `${rawKey}: waarde "${String(rawValue)}" kon niet als getal gelezen worden`,
        );
        continue;
      }
      if (!isWithinRange(key, num)) {
        warnings.push(
          `${rawKey}: waarde ${num} valt buiten het plausibele bereik en is overgeslagen`,
        );
        continue;
      }
      applyDirectObservationField(key, num, observation);
      continue;
    }

    if (key in EXTRA_SENSOR_DIRECT_FIELDS) {
      recognizedFields.push(rawKey);
      const def = EXTRA_SENSOR_DIRECT_FIELDS[key];
      const num = toNumber(rawValue);
      if (num === undefined) {
        warnings.push(
          `${rawKey}: waarde "${String(rawValue)}" kon niet als getal gelezen worden`,
        );
        continue;
      }
      if (!isWithinRange(key, num)) {
        warnings.push(
          `${rawKey}: waarde ${num} valt buiten het plausibele bereik en is overgeslagen`,
        );
        continue;
      }
      const valueNumeric =
        def.kind === "speed_mph" ? mphToKmh(num) : ((num % 360) + 360) % 360;
      sensors.push({
        sensorType: def.sensorType,
        metric: def.metric,
        valueNumeric,
        unit: def.unit,
        sourceField: rawKey,
      });
      continue;
    }

    if (key in BOOLEAN_BATTERY_FIELDS) {
      recognizedFields.push(rawKey);
      const num = toNumber(rawValue);
      if (num === undefined) {
        warnings.push(`${rawKey}: batterijstatus kon niet gelezen worden`);
        continue;
      }
      sensors.push({
        sensorType: "battery",
        metric: `battery_${BOOLEAN_BATTERY_FIELDS[key]}`,
        valueText: num === 0 ? "ok" : "laag",
        sourceField: rawKey,
      });
      continue;
    }

    let matchedChannel = false;
    for (const patternDef of CHANNEL_FIELD_PATTERNS) {
      const match = patternDef.pattern.exec(key);
      if (!match) {
        continue;
      }
      matchedChannel = true;
      recognizedFields.push(rawKey);
      const channel = match[1] ? Number(match[1]) : undefined;
      const num = toNumber(rawValue);
      if (num === undefined) {
        warnings.push(
          `${rawKey}: waarde "${String(rawValue)}" kon niet als getal gelezen worden`,
        );
        break;
      }
      // Eenvoudige plausibiliteitscheck: temperaturen (in °F, vóór conversie)
      // en percentages moeten binnen een redelijk bereik vallen. Overige
      // kanaalmetrieken (batterijspanning, PM2.5-concentratie, CO₂, ...)
      // hebben geen vaste bovengrens die generiek genoeg is om hier te
      // controleren — een overduidelijk kapotte sensor daar valt vooral op
      // via de diagnosepagina.
      if (patternDef.isFahrenheit && (num < -60 || num > 160)) {
        warnings.push(
          `${rawKey}: waarde ${num} valt buiten het plausibele bereik en is overgeslagen`,
        );
        break;
      }
      if (patternDef.unit === "%" && (num < 0 || num > 100)) {
        warnings.push(
          `${rawKey}: waarde ${num} valt buiten het plausibele bereik en is overgeslagen`,
        );
        break;
      }
      if (patternDef.isBooleanBattery) {
        sensors.push({
          sensorType: patternDef.sensorType,
          channel,
          metric: patternDef.metric,
          valueText: num === 0 ? "ok" : "laag",
          sourceField: rawKey,
        });
      } else {
        const valueNumeric = patternDef.isFahrenheit ? fahrenheitToCelsius(num) : num;
        sensors.push({
          sensorType: patternDef.sensorType,
          channel,
          metric: patternDef.metric,
          valueNumeric,
          unit: patternDef.unit,
          sourceField: rawKey,
        });
      }
      break;
    }
    if (matchedChannel) {
      continue;
    }

    if (key in MISC_SENSOR_FIELDS) {
      recognizedFields.push(rawKey);
      const def = MISC_SENSOR_FIELDS[key];
      const num = toNumber(rawValue);
      if (num === undefined) {
        warnings.push(
          `${rawKey}: waarde "${String(rawValue)}" kon niet als getal gelezen worden`,
        );
        continue;
      }

      if (def.epochSecondsAsIsoText) {
        // Epoch-seconden passen niet in `value_numeric` (decimal(12,4)) —
        // zie de toelichting bij `epochSecondsAsIsoText` in fields.ts. Sla op
        // als leesbare ISO-tekst in `value_text` in plaats van als getal.
        const asDate = new Date(num * 1000);
        if (Number.isNaN(asDate.getTime())) {
          warnings.push(
            `${rawKey}: waarde "${String(rawValue)}" is geen geldig tijdstip`,
          );
          continue;
        }
        sensors.push({
          sensorType: def.sensorType,
          metric: def.metric,
          valueText: asDate.toISOString(),
          sourceField: rawKey,
        });
        continue;
      }

      sensors.push({
        sensorType: def.sensorType,
        metric: def.metric,
        valueNumeric: num,
        unit: def.unit,
        sourceField: rawKey,
      });
      continue;
    }

    // Niets van het bovenstaande herkende dit veld.
    unknownFields[rawKey] = rawValue;
  }

  const hasObservationValues = Object.keys(observation).length > 0;
  const hasSensorValues = sensors.length > 0;
  const hasOutOfRangeOrUnreadableWarning = warnings.some(
    (warning) => !warning.startsWith("dateutc"),
  );

  let quality: ParsedQualityStatus;
  if (!hasObservationValues && !hasSensorValues) {
    quality = "missing";
  } else if (hasOutOfRangeOrUnreadableWarning) {
    quality = "suspect";
  } else if (timestamp.source === "received_at_fallback") {
    quality = "estimated";
  } else {
    quality = "ok";
  }

  return {
    measuredAt: timestamp.date,
    measuredAtSource: timestamp.source,
    observation,
    sensors,
    recognizedFields,
    unknownFields,
    warnings,
    quality,
  };
}
