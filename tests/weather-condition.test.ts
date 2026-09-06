import { describe, expect, it } from "vitest";

import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE } from "@/lib/weather/sun";
import { determineWeatherScene } from "@/lib/weather/condition";

// Vaste, ondubbelzinnige testmomenten (De Bilt-coördinaten): ruim vóór/ná
// zonsopkomst/-ondergang, zodat het dagdeel niet toevallig in een
// schemeringsvenster valt.
const MIDSUMMER_MIDDAY_UTC = new Date("2026-06-21T12:00:00.000Z"); // ~14:00 lokale zomertijd
const MIDSUMMER_MIDNIGHT_UTC = new Date("2026-06-21T00:30:00.000Z"); // ~02:30 lokale zomertijd

describe("condition.ts — determineWeatherScene", () => {
  it("kiest 'regen' zodra het regent, ongeacht dagdeel of zonnestraling", () => {
    const dayResult = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 2.5,
      solarRadiationWm2: 800,
    });
    const nightResult = determineWeatherScene({
      now: MIDSUMMER_MIDNIGHT_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0.5,
      solarRadiationWm2: null,
    });

    expect(dayResult.scene).toBe("regen");
    expect(nightResult.scene).toBe("regen");
  });

  it("kiest 'nacht' als de zon ruim onder de horizon staat en het niet regent", () => {
    const result = determineWeatherScene({
      now: MIDSUMMER_MIDNIGHT_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0,
      solarRadiationWm2: null,
    });

    expect(result.scene).toBe("nacht");
    expect(result.daypart).toBe("nacht");
  });

  it("kiest 'helder' overdag als de gemeten zonnestraling dicht bij de theoretische heldere-hemel-waarde ligt", () => {
    const result = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0,
      solarRadiationWm2: 850, // hoge zonshoogte in midzomer ⇒ hoge heldere-hemel-referentie
    });

    expect(result.scene).toBe("helder");
    expect(result.daypart).toBe("dag");
  });

  it("kiest 'bewolkt' overdag als de gemeten zonnestraling ver onder de theoretische waarde blijft", () => {
    const result = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0,
      solarRadiationWm2: 50,
    });

    expect(result.scene).toBe("bewolkt");
  });

  it("valt terug op 'helder' overdag zonder regen als er geen zonnestralingsmeting is", () => {
    const result = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0,
      solarRadiationWm2: null,
    });

    expect(result.scene).toBe("helder");
  });

  it("valt terug op de standaardcoördinaten (De Bilt) als het station geen latitude/longitude heeft", () => {
    const withCoords = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0,
      solarRadiationWm2: null,
    });
    const withoutCoords = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: null,
      longitude: null,
      rainRateMmH: 0,
      solarRadiationWm2: null,
    });

    expect(withoutCoords.scene).toBe(withCoords.scene);
    expect(withoutCoords.daypart).toBe(withCoords.daypart);
  });

  it("geeft altijd sunriseUtc/sunsetUtc terug voor een Nederlandse locatie", () => {
    const result = determineWeatherScene({
      now: MIDSUMMER_MIDDAY_UTC,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      rainRateMmH: 0,
      solarRadiationWm2: null,
    });

    expect(result.sunriseUtc).not.toBeNull();
    expect(result.sunsetUtc).not.toBeNull();
  });
});
