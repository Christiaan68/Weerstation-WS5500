/**
 * Eenheidsconversies voor weergegevens.
 *
 * De Alecto WS5500 (en het onderliggende Ecowitt-protocol) kan waarden in
 * Amerikaanse eenheden aanleveren (°F, mph, inch, inHg). Deze helpers
 * zetten dat om naar de metrische eenheden die deze applicatie intern en
 * in de UI gebruikt (°C, km/h, mm, hPa). De functies geven bewust de volle
 * precisie terug; afronden voor weergave gebeurt in de UI-laag.
 */

/** Zet graden Fahrenheit om naar graden Celsius. */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/** Zet mijl per uur (mph) om naar kilometer per uur (km/h). */
export function mphToKmh(mph: number): number {
  return mph * 1.609344;
}

/** Zet inches (regen) om naar millimeters. */
export function inchToMm(inch: number): number {
  return inch * 25.4;
}

/** Zet inches kwik (inHg, luchtdruk) om naar hectopascal (hPa). */
export function inHgToHpa(inHg: number): number {
  return inHg * 33.8638866667;
}

/**
 * De 16 windrichtingen van het kompas, in het Nederlands, in volgorde
 * beginnend bij noord (0°) en met de klok mee.
 */
export const COMPASS_POINTS = [
  "N",
  "NNO",
  "NO",
  "ONO",
  "O",
  "OZO",
  "ZO",
  "ZZO",
  "Z",
  "ZZW",
  "ZW",
  "WZW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * Zet een windrichting in graden (0–360, elke waarde toegestaan, ook
 * negatief of >360) om naar de dichtstbijzijnde van de 16 Nederlandse
 * windrichtingen.
 */
export function degreesToCompass(degrees: number): CompassPoint {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index];
}
