import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseEcowittPayload } from "@/lib/weather/ecowitt/parse";
import type { RawPayload } from "@/lib/weather/types";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/ecowitt");

function loadFixture(name: string): RawPayload {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8")) as RawPayload;
}

const RECEIVED_AT = new Date("2026-01-15T10:30:05.000Z");

describe("parseEcowittPayload — full-payload fixture", () => {
  const parsed = parseEcowittPayload(loadFixture("full-payload.json"), {
    receivedAt: RECEIVED_AT,
  });

  it("herkent alle velden en laat niets onbekend", () => {
    expect(Object.keys(parsed.unknownFields)).toHaveLength(0);
  });

  it("heeft kwaliteitsstatus 'ok' (alles binnen bereik, geen fallback)", () => {
    expect(parsed.quality).toBe("ok");
    expect(parsed.warnings).toHaveLength(0);
  });

  it("converteert temperatuur van Fahrenheit naar Celsius", () => {
    // 42.1°F ≈ 5.61°C
    expect(parsed.observation.temperatureOutdoorC).toBeCloseTo(5.61, 1);
  });

  it("converteert windsnelheid van mph naar km/h", () => {
    // 6.5 mph ≈ 10.46 km/h
    expect(parsed.observation.windSpeedKmh).toBeCloseTo(10.46, 1);
  });

  it("converteert luchtdruk van inHg naar hPa", () => {
    // 29.92 inHg ≈ 1013.1 hPa
    expect(parsed.observation.pressureRelativeHpa).toBeCloseTo(1013.1, 0);
  });

  it("converteert regen van inch naar mm", () => {
    // 0.15 inch ≈ 3.81 mm
    expect(parsed.observation.rainDayMm).toBeCloseTo(3.81, 1);
  });

  it("neemt UV-index en zonnestraling over zonder conversie", () => {
    expect(parsed.observation.uvIndex).toBe(2);
    expect(parsed.observation.solarRadiationWm2).toBe(120.5);
  });

  it("plaatst extra kanaalsensoren (temp1f, soilmoisture1, pm25_ch1) in `sensors`", () => {
    const types = parsed.sensors.map((sensor) => `${sensor.sensorType}:${sensor.metric}`);
    expect(types).toContain("extra_temperature:temperature_c");
    expect(types).toContain("extra_humidity:humidity_pct");
    expect(types).toContain("soil_moisture:moisture_pct");
    expect(types).toContain("pm25:concentration_ugm3");
  });

  it("gebruikt het dateutc-tijdstip (geen fallback)", () => {
    expect(parsed.measuredAtSource).toBe("dateutc");
    expect(parsed.measuredAt.toISOString()).toBe("2026-01-15T10:30:00.000Z");
  });
});

describe("parseEcowittPayload — minimal-payload fixture", () => {
  it("verwerkt een minimale payload met alleen PASSKEY/dateutc/tempf/humidity", () => {
    const parsed = parseEcowittPayload(loadFixture("minimal-payload.json"), {
      receivedAt: RECEIVED_AT,
    });

    expect(parsed.quality).toBe("ok");
    expect(parsed.measuredAtSource).toBe("dateutc_now");
    expect(parsed.measuredAt).toEqual(RECEIVED_AT);
    expect(parsed.observation.temperatureOutdoorC).toBeDefined();
    expect(parsed.observation.humidityOutdoorPct).toBe(60);
    expect(Object.keys(parsed.unknownFields)).toHaveLength(0);
  });
});

describe("parseEcowittPayload — unknown-fields-payload fixture", () => {
  const parsed = parseEcowittPayload(loadFixture("unknown-fields-payload.json"), {
    receivedAt: RECEIVED_AT,
  });

  it("herkent de bekende velden gewoon", () => {
    expect(parsed.observation.temperatureOutdoorC).toBeDefined();
    expect(parsed.observation.humidityOutdoorPct).toBe(77);
    expect(parsed.observation.windSpeedKmh).toBeDefined();
  });

  it("verzamelt de niet-herkende velden zonder ze te verliezen", () => {
    expect(Object.keys(parsed.unknownFields).sort()).toEqual(
      ["future_gas_sensor_ppm", "some_new_field_v2", "wh90_signal_strength"].sort(),
    );
    // De oorspronkelijke waarde blijft exact bewaard.
    expect(parsed.unknownFields.future_gas_sensor_ppm).toBe("412");
  });
});

describe("parseEcowittPayload — battery-fields-payload fixture", () => {
  const parsed = parseEcowittPayload(loadFixture("battery-fields-payload.json"), {
    receivedAt: RECEIVED_AT,
  });

  it("zet booleaanse batterijvelden om naar 'ok'/'laag'", () => {
    const wh65 = parsed.sensors.find((sensor) => sensor.sourceField === "wh65batt");
    const wh25 = parsed.sensors.find((sensor) => sensor.sourceField === "wh25batt");
    expect(wh65?.valueText).toBe("laag"); // waarde was "1"
    expect(wh25?.valueText).toBe("ok"); // waarde was "0"
  });

  it("herkent kanaalgebonden batterijspanningen als numerieke sensor-metingen", () => {
    const soilbatt1 = parsed.sensors.find((sensor) => sensor.sourceField === "soilbatt1");
    expect(soilbatt1?.metric).toBe("battery_voltage");
    expect(soilbatt1?.valueNumeric).toBeCloseTo(1.5, 1);
    expect(soilbatt1?.channel).toBe(1);
  });

  it("herkent CO2- en bliksemvelden", () => {
    const types = parsed.sensors.map((sensor) => sensor.sourceField);
    expect(types).toContain("co2");
    expect(types).toContain("lightning_num");
  });

  it(
    "REGRESSIE: slaat lightning_time op als ISO-tekst, niet als getal " +
      "(epoch-seconden passen niet in de decimal(12,4) value_numeric-kolom " +
      "— veroorzaakte een echte databasefout tijdens de live-smoketest)",
    () => {
      const lightningTime = parsed.sensors.find(
        (sensor) => sensor.sourceField === "lightning_time",
      );
      expect(lightningTime?.valueNumeric).toBeUndefined();
      expect(lightningTime?.valueText).toBe("2026-01-15T10:10:00.000Z");
    },
  );

  it("laat geen enkel veld onherkend", () => {
    expect(Object.keys(parsed.unknownFields)).toHaveLength(0);
  });
});

describe("parseEcowittPayload — wunderground-get-payload fixture (legacy protocol)", () => {
  const parsed = parseEcowittPayload(loadFixture("wunderground-get-payload.json"), {
    receivedAt: RECEIVED_AT,
  });

  it("herkent ID/PASSWORD/action als metadata, niet als onbekend veld", () => {
    expect(parsed.unknownFields.ID).toBeUndefined();
    expect(parsed.unknownFields.PASSWORD).toBeUndefined();
    expect(parsed.unknownFields.action).toBeUndefined();
  });

  it("mapt de Wunderground-aliassen 'rainin' en 'baromin' naar dezelfde meting als hun Ecowitt-tegenhanger", () => {
    expect(parsed.observation.rainHourMm).toBeDefined();
    expect(parsed.observation.pressureAbsoluteHpa).toBeDefined();
  });

  it("herkent dewptf als dauwpunt", () => {
    expect(parsed.observation.dewPointC).toBeDefined();
  });
});

describe("parseEcowittPayload — malformed-payload fixture", () => {
  const parsed = parseEcowittPayload(loadFixture("malformed-payload.json"), {
    receivedAt: RECEIVED_AT,
  });

  it("valt terug op ontvangsttijd wanneer dateutc onleesbaar is", () => {
    expect(parsed.measuredAtSource).toBe("received_at_fallback");
  });

  it("slaat elk veld met een onleesbare/onplausibele waarde over (geen crash)", () => {
    expect(parsed.observation.temperatureOutdoorC).toBeUndefined();
    expect(parsed.observation.humidityOutdoorPct).toBeUndefined();
    expect(parsed.observation.windSpeedKmh).toBeUndefined();
    expect(parsed.observation.solarRadiationWm2).toBeUndefined();
  });

  it("markeert de kwaliteit als 'missing' zonder enige bruikbare meting", () => {
    expect(parsed.quality).toBe("missing");
    expect(parsed.sensors).toHaveLength(0);
  });

  it("verzamelt waarschuwingen voor elk overgeslagen veld", () => {
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(4);
  });
});

describe("parseEcowittPayload — partial-bad-payload fixture (kernvereiste: geen totaal dataverlies)", () => {
  const parsed = parseEcowittPayload(loadFixture("partial-bad-payload.json"), {
    receivedAt: RECEIVED_AT,
  });

  it("slaat de GOEDE velden gewoon op, ondanks dat andere velden in dezelfde payload slecht zijn", () => {
    expect(parsed.observation.temperatureOutdoorC).toBeDefined();
    expect(parsed.observation.humidityOutdoorPct).toBe(72);
    expect(parsed.observation.windSpeedKmh).toBeDefined();
    expect(parsed.observation.pressureRelativeHpa).toBeDefined();
  });

  it("negeert alleen de specifieke slechte velden (uv, solarradiation, temp1f), niet de hele payload", () => {
    expect(parsed.observation.uvIndex).toBeUndefined();
    expect(parsed.observation.solarRadiationWm2).toBeUndefined();
    expect(
      parsed.sensors.find((sensor) => sensor.sourceField === "temp1f"),
    ).toBeUndefined();
  });

  it("markeert de kwaliteit als 'suspect' (niet 'ok', niet 'missing') zodat dit zichtbaar blijft voor diagnose", () => {
    expect(parsed.quality).toBe("suspect");
  });

  it("levert per overgeslagen veld een waarschuwing, zodat niets stilzwijgend verdwijnt", () => {
    expect(parsed.warnings.some((warning) => warning.includes("uv"))).toBe(true);
    expect(parsed.warnings.some((warning) => warning.includes("solarradiation"))).toBe(
      true,
    );
    expect(parsed.warnings.some((warning) => warning.includes("temp1f"))).toBe(true);
  });
});
