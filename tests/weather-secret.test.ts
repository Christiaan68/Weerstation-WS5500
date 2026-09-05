import { describe, expect, it } from "vitest";

import { secretMatches } from "@/lib/weather/secret";

describe("secretMatches", () => {
  it("geeft true bij een exacte overeenkomst", () => {
    expect(secretMatches("mijn-geheime-waarde", "mijn-geheime-waarde")).toBe(true);
  });

  it("geeft false bij een andere waarde van dezelfde lengte", () => {
    expect(secretMatches("mijn-geheime-waardf", "mijn-geheime-waarde")).toBe(false);
  });

  it("geeft false bij een andere lengte", () => {
    expect(secretMatches("kort", "mijn-geheime-waarde")).toBe(false);
  });

  it("geeft false als het verwachte secret niet geconfigureerd is", () => {
    expect(secretMatches("iets", undefined)).toBe(false);
  });

  it("geeft false als er geen kandidaat is opgegeven", () => {
    expect(secretMatches(undefined, "mijn-geheime-waarde")).toBe(false);
  });

  it("geeft false als beide leeg zijn", () => {
    expect(secretMatches(undefined, undefined)).toBe(false);
  });
});
