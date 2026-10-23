import { describe, expect, it } from "vitest";

import type { WeatherObservation } from "@/lib/db/schema";
import { deriveStationCapabilities, EMPTY_CAPABILITIES } from "@/lib/weather/capabilities";

/**
 * Volledige `WeatherObservation` met alle velden op `null` — realistisch
 * voor een station dat alléén basis-temperatuur/vocht meet. Tests
 * overschrijven per geval alleen de velden die ze nodig hebben, zodat
 * duidelijk blijft welk veld welke capability triggert (Fase 5, §35-38).
 */
function makeObservation(overrides: Partial<WeatherObservation> = {}): WeatherObservation {
  return {
    id: 1,
    stationId: 1,
    rawPacketId: null,
    measuredAt: new Date("2026-09-05T12:00:00.000Z"),
    receivedAt: new Date("2026-09-05T12:00:01.000Z"),
    temperatureOutdoorC: null,
    temperatureIndoorC: null,
    humidityOutdoorPct: null,
    humidityIndoorPct: null,
    dewPointC: null,
    feelsLikeC: null,
    windChillC: null,
    heatIndexC: null,
    pressureAbsoluteHpa: null,
    pressureRelativeHpa: null,
    windSpeedKmh: null,
    windGustKmh: null,
    windDirectionDeg: null,
    rainRateMmH: null,
    rainEventMm: null,
    rainHourMm: null,
    rainDayMm: null,
    rainWeekMm: null,
    rainMonthMm: null,
    rainYearMm: null,
    rainTotalMm: null,
    uvIndex: null,
    solarRadiationWm2: null,
    qualityStatus: "ok",
    qualityFlags: null,
    createdAt: new Date("2026-09-05T12:00:01.000Z"),
    ...overrides,
  };
}

describe("deriveStationCapabilities", () => {
  it("zonder metingen zijn alle capabilities false/leeg (EMPTY_CAPABILITIES) — nooit geraden", () => {
    const result = deriveStationCapabilities(undefined, []);
    expect(result).toEqual(EMPTY_CAPABILITIES);
    expect(result.hasOutdoorTemperature).toBe(false);
    expect(result.hasWind).toBe(false);
    expect(result.hasRain).toBe(false);
    expect(result.extraSensorTypes).toEqual([]);
  });

  it("herkent buitentemperatuur/binnentemperatuur/vocht onafhankelijk van elkaar", () => {
    const result = deriveStationCapabilities(
      makeObservation({ temperatureOutdoorC: "18.5", humidityIndoorPct: "45.0" }),
      [],
    );
    expect(result.hasOutdoorTemperature).toBe(true);
    expect(result.hasIndoorTemperature).toBe(false);
    expect(result.hasHumidityOutdoor).toBe(false);
    expect(result.hasHumidityIndoor).toBe(true);
  });

  it("'wind' telt als aanwezig zodra windrichting bekend is, ook zonder snelheid/stoot", () => {
    const result = deriveStationCapabilities(
      makeObservation({ windSpeedKmh: null, windGustKmh: null, windDirectionDeg: 270 }),
      [],
    );
    expect(result.hasWind).toBe(true);
  });

  it("een station zonder regenmeter (alle rain-velden null) krijgt hasRain=false, nooit 0 mm verzonnen", () => {
    const result = deriveStationCapabilities(makeObservation({ temperatureOutdoorC: "10.0" }), []);
    expect(result.hasRain).toBe(false);
  });

  it("regen telt als aanwezig zodra minstens één regenveld een waarde heeft", () => {
    const result = deriveStationCapabilities(makeObservation({ rainDayMm: "0.00" }), []);
    expect(result.hasRain).toBe(true);
  });

  it("luchtdruk telt als aanwezig bij absolute ÓF relatieve druk", () => {
    expect(
      deriveStationCapabilities(makeObservation({ pressureAbsoluteHpa: "1013.0" }), []).hasPressure,
    ).toBe(true);
    expect(
      deriveStationCapabilities(makeObservation({ pressureRelativeHpa: "1015.0" }), []).hasPressure,
    ).toBe(true);
    expect(deriveStationCapabilities(makeObservation(), []).hasPressure).toBe(false);
  });

  it("leidt bliksem/bodemvocht/bladvocht/luchtkwaliteit/waterlek af uit sensor_measurements-types", () => {
    const result = deriveStationCapabilities(makeObservation(), [
      "lightning",
      "soil_moisture",
      "leaf_wetness",
      "pm25",
      "co2",
      "water_leak",
    ]);
    expect(result.hasLightning).toBe(true);
    expect(result.hasSoilMoisture).toBe(true);
    expect(result.hasLeafWetness).toBe(true);
    expect(result.hasAirQuality).toBe(true);
    expect(result.hasWaterLeak).toBe(true);
    expect(result.extraSensorTypes).toEqual([]);
  });

  it("onbekende/overige sensor_types belanden in extraSensorTypes, gesorteerd — geen eigen vlag nodig", () => {
    const result = deriveStationCapabilities(makeObservation(), [
      "extra_temperature",
      "battery",
      "extra_humidity",
    ]);
    expect(result.hasLightning).toBe(false);
    expect(result.extraSensorTypes).toEqual(["battery", "extra_humidity", "extra_temperature"]);
  });

  it("een sensor die eerder is losgekoppeld maar ooit gemeten heeft blijft 'aanwezig' (capability is historisch, niet live)", () => {
    // sensor_measurements bevat ooit ontvangen sensor_types; dat een kanaal
    // NU niet meer meldt, verandert die lijst niet met terugwerkende kracht —
    // bewust: de UI mag een kaart die ooit data toonde niet plots verbergen.
    const result = deriveStationCapabilities(undefined, ["soil_moisture"]);
    expect(result.hasSoilMoisture).toBe(true);
  });
});
