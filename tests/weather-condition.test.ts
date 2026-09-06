import { describe, expect, it } from "vitest";

import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE } from "@/lib/weather/sun";
import { determineWeatherScene, type ConditionInput } from "@/lib/weather/condition";

// Vaste, ondubbelzinnige testmomenten (De Bilt-coördinaten): ruim vóór/ná
// zonsopkomst/-ondergang, zodat het dagdeel niet toevallig in een
// schemeringsvenster valt.
const MIDSUMMER_MIDDAY_UTC = new Date("2026-06-21T12:00:00.000Z"); // ~14:00 lokale zomertijd
const MIDSUMMER_MIDNIGHT_UTC = new Date("2026-06-21T00:30:00.000Z"); // ~02:30 lokale zomertijd

/** Vult de niet-relevante velden van `ConditionInput` met neutrale defaults. */
function input(overrides: Partial<ConditionInput>): ConditionInput {
  return {
    now: MIDSUMMER_MIDDAY_UTC,
    latitude: DEFAULT_LATITUDE,
    longitude: DEFAULT_LONGITUDE,
    rainRateMmH: 0,
    solarRadiationWm2: null,
    temperatureOutdoorC: null,
    humidityOutdoorPct: null,
    dewPointC: null,
    ...overrides,
  };
}

describe("condition.ts — determineWeatherScene", () => {
  it("kiest 'regen' zodra het licht regent, ongeacht dagdeel of zonnestraling", () => {
    const dayResult = determineWeatherScene(
      input({ rainRateMmH: 2.5, solarRadiationWm2: 800, temperatureOutdoorC: 18 }),
    );
    const nightResult = determineWeatherScene(
      input({
        now: MIDSUMMER_MIDNIGHT_UTC,
        rainRateMmH: 0.5,
        temperatureOutdoorC: 15,
      }),
    );

    expect(dayResult.scene).toBe("regen");
    expect(nightResult.scene).toBe("regen");
  });

  it("kiest 'zware-regen' boven de zware-regendrempel", () => {
    const result = determineWeatherScene(input({ rainRateMmH: 12, temperatureOutdoorC: 16 }));

    expect(result.scene).toBe("zware-regen");
  });

  it("kiest 'sneeuw' als het regent én de temperatuur op/onder het vriespunt-drempel ligt", () => {
    const result = determineWeatherScene(input({ rainRateMmH: 1.2, temperatureOutdoorC: -1 }));

    expect(result.scene).toBe("sneeuw");
  });

  it("kiest 'mist' bij hoge luchtvochtigheid en een kleine dauwpuntspreiding zonder regen", () => {
    const result = determineWeatherScene(
      input({
        rainRateMmH: 0,
        temperatureOutdoorC: 10,
        humidityOutdoorPct: 97,
        dewPointC: 9.6,
      }),
    );

    expect(result.scene).toBe("mist");
  });

  it("kiest geen 'mist' als de dauwpuntspreiding te groot is, ondanks hoge luchtvochtigheid", () => {
    const result = determineWeatherScene(
      input({
        rainRateMmH: 0,
        solarRadiationWm2: 850,
        temperatureOutdoorC: 18,
        humidityOutdoorPct: 96,
        dewPointC: 12,
      }),
    );

    expect(result.scene).not.toBe("mist");
  });

  it("regen wint altijd van mist, ook als aan beide voorwaarden voldaan zou zijn", () => {
    const result = determineWeatherScene(
      input({
        rainRateMmH: 1,
        temperatureOutdoorC: 12,
        humidityOutdoorPct: 99,
        dewPointC: 11.8,
      }),
    );

    expect(result.scene).toBe("regen");
  });

  it("kiest 'nacht' als de zon ruim onder de horizon staat en het niet regent", () => {
    const result = determineWeatherScene(input({ now: MIDSUMMER_MIDNIGHT_UTC, rainRateMmH: 0 }));

    expect(result.scene).toBe("nacht");
    expect(result.daypart).toBe("nacht");
  });

  it("kiest 'helder' overdag als de gemeten zonnestraling dicht bij de theoretische heldere-hemel-waarde ligt", () => {
    const result = determineWeatherScene(
      input({ rainRateMmH: 0, solarRadiationWm2: 900 }), // hoge zonshoogte in midzomer ⇒ hoge heldere-hemel-referentie
    );

    expect(result.scene).toBe("helder");
    expect(result.daypart).toBe("dag");
  });

  it("kiest 'half-bewolkt' overdag als de gemeten zonnestraling rond de helft van de theoretische waarde ligt", () => {
    const result = determineWeatherScene(input({ rainRateMmH: 0, solarRadiationWm2: 400 }));

    expect(result.scene).toBe("half-bewolkt");
  });

  it("kiest 'bewolkt' overdag als de gemeten zonnestraling ver onder de theoretische waarde blijft", () => {
    const result = determineWeatherScene(input({ rainRateMmH: 0, solarRadiationWm2: 50 }));

    expect(result.scene).toBe("bewolkt");
  });

  it("valt terug op 'helder' overdag zonder regen als er geen zonnestralingsmeting is", () => {
    const result = determineWeatherScene(input({ rainRateMmH: 0, solarRadiationWm2: null }));

    expect(result.scene).toBe("helder");
  });

  it("valt terug op de standaardcoördinaten (De Bilt) als het station geen latitude/longitude heeft", () => {
    const withCoords = determineWeatherScene(input({ latitude: DEFAULT_LATITUDE, longitude: DEFAULT_LONGITUDE }));
    const withoutCoords = determineWeatherScene(input({ latitude: null, longitude: null }));

    expect(withoutCoords.scene).toBe(withCoords.scene);
    expect(withoutCoords.daypart).toBe(withCoords.daypart);
  });

  it("geeft altijd sunriseUtc/sunsetUtc terug voor een Nederlandse locatie", () => {
    const result = determineWeatherScene(input({}));

    expect(result.sunriseUtc).not.toBeNull();
    expect(result.sunsetUtc).not.toBeNull();
  });
});
