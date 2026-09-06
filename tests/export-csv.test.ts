import { describe, expect, it } from "vitest";

import {
  buildCsvLine,
  csvEscapeField,
  formatCsvNumber,
} from "@/lib/weather/export/csv";

describe("csvEscapeField", () => {
  it("laat een simpel veld ongewijzigd", () => {
    expect(csvEscapeField("19.7", "comma")).toBe("19.7");
  });

  it("quote een veld met het scheidingsteken (komma)", () => {
    expect(csvEscapeField("Amsterdam, NL", "comma")).toBe('"Amsterdam, NL"');
  });

  it("quote een veld met het scheidingsteken (puntkomma)", () => {
    expect(csvEscapeField("a;b", "semicolon")).toBe('"a;b"');
    expect(csvEscapeField("a,b", "semicolon")).toBe("a,b"); // komma is geen scheidingsteken bij ;-delimiter
  });

  it("verdubbelt interne dubbele aanhalingstekens", () => {
    expect(csvEscapeField('Zeg "hallo"', "comma")).toBe('"Zeg ""hallo"""');
  });

  it("quote een veld met een regeleinde", () => {
    expect(csvEscapeField("regel1\nregel2", "comma")).toBe('"regel1\nregel2"');
  });

  it("laat Nederlandse tekst met speciale tekens ongewijzigd (geen quoting nodig)", () => {
    expect(csvEscapeField("Zuidoostenwind bewölkt", "comma")).toBe("Zuidoostenwind bewölkt");
  });
});

describe("formatCsvNumber", () => {
  it("geeft een leeg veld terug voor null (nooit '0')", () => {
    expect(formatCsvNumber(null, "comma")).toBe("");
    expect(formatCsvNumber(undefined, "comma")).toBe("");
  });

  it("behoudt het decimaalpunt bij delimiter=comma", () => {
    expect(formatCsvNumber(19.7, "comma")).toBe("19.7");
    expect(formatCsvNumber("19.7", "comma")).toBe("19.7");
  });

  it("zet het decimaalpunt om naar een komma bij delimiter=semicolon", () => {
    expect(formatCsvNumber(19.7, "semicolon")).toBe("19,7");
    expect(formatCsvNumber("1015.6", "semicolon")).toBe("1015,6");
  });

  it("laat een geheel getal (zonder punt) ongewijzigd bij beide delimiters", () => {
    expect(formatCsvNumber(42, "comma")).toBe("42");
    expect(formatCsvNumber(42, "semicolon")).toBe("42");
  });
});

describe("buildCsvLine", () => {
  it("bouwt een regel met komma-scheiding", () => {
    expect(buildCsvLine(["a", "b", "c"], "comma")).toBe("a,b,c");
  });

  it("bouwt een regel met puntkomma-scheiding (komma in een veld is geen ambiguïteit bij ;-delimiter, dus geen quoting nodig)", () => {
    expect(buildCsvLine(["19,7", "1015,6"], "semicolon")).toBe("19,7;1015,6");
  });

  it("quote wél als een veld het puntkomma-scheidingsteken zelf bevat", () => {
    expect(buildCsvLine(["a;b", "c"], "semicolon")).toBe('"a;b";c');
  });

  it("verwerkt lege velden (ontbrekende metingen) correct als lege string tussen scheidingstekens", () => {
    expect(buildCsvLine(["19.7", "", "1015.6"], "comma")).toBe("19.7,,1015.6");
  });
});
