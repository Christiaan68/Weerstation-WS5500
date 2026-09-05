/**
 * Normalisatiestap: zet een `ParsedWeatherPacket` (parser-tussenvorm, al in
 * metrische eenheden) om naar rijen die direct in `weather_observations` en
 * `sensor_measurements` geschreven kunnen worden (zie `src/lib/db/schema.ts`).
 *
 * Bewust gescheiden van het parsen zelf (`src/lib/weather/ecowitt/parse.ts`):
 * de parser weet niets van database-id's of -precisie, deze stap voegt
 * `stationId`/`rawPacketId`/`observationId` toe en rondt elk veld af op
 * exact de decimale precisie van zijn kolom (Drizzle's `decimal`-kolommen
 * verwachten in dit project een string met een vaste precisie — zie ook
 * `scripts/generate-demo-weather.ts`, dat dezelfde conventie gebruikt).
 */
import type { NewSensorMeasurement, NewWeatherObservation } from "@/lib/db/schema";
import type { ParsedObservationFields, ParsedWeatherPacket } from "./types";

/** Rondt af en zet om naar een string met vaste precisie, of `undefined` als de waarde ontbreekt. */
function decimalString(
  value: number | undefined,
  fractionDigits: number,
): string | undefined {
  return value === undefined ? undefined : value.toFixed(fractionDigits);
}

export function buildObservationRow(
  parsed: ParsedWeatherPacket,
  ids: { stationId: number; rawPacketId: number },
): NewWeatherObservation {
  const o: ParsedObservationFields = parsed.observation;

  return {
    stationId: ids.stationId,
    rawPacketId: ids.rawPacketId,
    measuredAt: parsed.measuredAt,

    temperatureOutdoorC: decimalString(o.temperatureOutdoorC, 1),
    temperatureIndoorC: decimalString(o.temperatureIndoorC, 1),
    humidityOutdoorPct: decimalString(o.humidityOutdoorPct, 1),
    humidityIndoorPct: decimalString(o.humidityIndoorPct, 1),
    dewPointC: decimalString(o.dewPointC, 1),
    feelsLikeC: decimalString(o.feelsLikeC, 1),
    windChillC: decimalString(o.windChillC, 1),
    heatIndexC: decimalString(o.heatIndexC, 1),

    pressureAbsoluteHpa: decimalString(o.pressureAbsoluteHpa, 1),
    pressureRelativeHpa: decimalString(o.pressureRelativeHpa, 1),

    windSpeedKmh: decimalString(o.windSpeedKmh, 1),
    windGustKmh: decimalString(o.windGustKmh, 1),
    // `windDirectionDeg` is een `smallint`, geen `decimal` — gewoon een geheel getal.
    windDirectionDeg:
      o.windDirectionDeg !== undefined ? Math.round(o.windDirectionDeg) : undefined,

    rainRateMmH: decimalString(o.rainRateMmH, 2),
    rainEventMm: decimalString(o.rainEventMm, 2),
    rainHourMm: decimalString(o.rainHourMm, 2),
    rainDayMm: decimalString(o.rainDayMm, 2),
    rainWeekMm: decimalString(o.rainWeekMm, 2),
    rainMonthMm: decimalString(o.rainMonthMm, 2),
    rainYearMm: decimalString(o.rainYearMm, 2),
    rainTotalMm: decimalString(o.rainTotalMm, 2),

    uvIndex: decimalString(o.uvIndex, 1),
    solarRadiationWm2: decimalString(o.solarRadiationWm2, 1),

    qualityStatus: parsed.quality,
    qualityFlags: parsed.warnings.length > 0 ? parsed.warnings : null,
  };
}

/**
 * Levert sensor-rijen ZONDER `observationId` op: dat id bestaat pas nadat de
 * bijbehorende `weather_observations`-rij is ingevoegd. Zie
 * `insertObservationWithSensors()` in `src/lib/db/queries.ts`, dat beide in
 * één transactie doet en het id op het juiste moment invult.
 */
export function buildSensorMeasurementRows(
  parsed: ParsedWeatherPacket,
  ids: { stationId: number },
): Omit<NewSensorMeasurement, "observationId">[] {
  return parsed.sensors.map((sensor) => ({
    stationId: ids.stationId,
    measuredAt: parsed.measuredAt,
    sensorType: sensor.sensorType,
    channel: sensor.channel,
    metric: sensor.metric,
    valueNumeric: decimalString(sensor.valueNumeric, 4),
    valueText: sensor.valueText,
    unit: sensor.unit,
    metadata: { sourceField: sensor.sourceField },
  }));
}
