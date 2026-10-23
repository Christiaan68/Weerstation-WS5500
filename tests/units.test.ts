import { describe, expect, it } from "vitest";

import {
  degreesToCompass,
  fahrenheitToCelsius,
  inchToMm,
  inHgToHpa,
  mphToKmh,
  windArrowRotationDeg,
} from "@/lib/weather/units";

describe("fahrenheitToCelsius", () => {
  it("zet het vriespunt correct om", () => {
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 5);
  });

  it("zet het kookpunt correct om", () => {
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 5);
  });

  it("werkt ook onder nul", () => {
    expect(fahrenheitToCelsius(-40)).toBeCloseTo(-40, 5);
  });
});

describe("mphToKmh", () => {
  it("zet een bekende waarde correct om", () => {
    expect(mphToKmh(1)).toBeCloseTo(1.609344, 6);
  });

  it("0 mph is 0 km/h", () => {
    expect(mphToKmh(0)).toBe(0);
  });

  it("60 mph is ongeveer 96.6 km/h", () => {
    expect(mphToKmh(60)).toBeCloseTo(96.56064, 4);
  });
});

describe("inchToMm", () => {
  it("1 inch is 25.4 mm", () => {
    expect(inchToMm(1)).toBeCloseTo(25.4, 5);
  });

  it("0 inch is 0 mm", () => {
    expect(inchToMm(0)).toBe(0);
  });
});

describe("inHgToHpa", () => {
  it("zet standaard luchtdruk (29.92 inHg) om naar ongeveer 1013 hPa", () => {
    expect(inHgToHpa(29.92)).toBeCloseTo(1013.25, 0);
  });

  it("0 inHg is 0 hPa", () => {
    expect(inHgToHpa(0)).toBe(0);
  });
});

describe("degreesToCompass", () => {
  it.each([
    [0, "N"],
    [22.5, "NNO"],
    [45, "NO"],
    [67.5, "ONO"],
    [90, "O"],
    [112.5, "OZO"],
    [135, "ZO"],
    [157.5, "ZZO"],
    [180, "Z"],
    [202.5, "ZZW"],
    [225, "ZW"],
    [247.5, "WZW"],
    [270, "W"],
    [292.5, "WNW"],
    [315, "NW"],
    [337.5, "NNW"],
    [360, "N"],
  ])("%i graden wordt %s", (deg, expected) => {
    expect(degreesToCompass(deg)).toBe(expected);
  });

  it("rondt af naar de dichtstbijzijnde windrichting", () => {
    expect(degreesToCompass(10)).toBe("N");
    expect(degreesToCompass(15)).toBe("NNO");
  });

  it("gaat correct om met negatieve en >360 graden", () => {
    expect(degreesToCompass(-45)).toBe("NW");
    expect(degreesToCompass(405)).toBe("NO");
  });
});

describe("windArrowRotationDeg", () => {
  it("draait de pijl naar waar de wind NAARTOE waait (gemeten richting + 180°)", () => {
    expect(windArrowRotationDeg(0)).toBe(180); // wind uit het noorden → pijl wijst naar het zuiden
    expect(windArrowRotationDeg(90)).toBe(270); // uit het oosten → naar het westen
    expect(windArrowRotationDeg(180)).toBe(0); // uit het zuiden → naar het noorden (omhoog)
    expect(windArrowRotationDeg(270)).toBe(90); // uit het westen → naar het oosten
  });

  it("normaliseert naar 0–360", () => {
    expect(windArrowRotationDeg(350)).toBe(170);
    expect(windArrowRotationDeg(-10)).toBe(170);
  });
});
