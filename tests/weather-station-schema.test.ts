import { describe, expect, it } from "vitest";

import {
  createStationFormSchema,
  describeDuplicateKeyError,
  slugify,
  testConnectionSchema,
  updateStationFormSchema,
} from "@/lib/weather/station-schema";

/** Geldige basisinvoer voor het aanmaakformulier — tests overschrijven per geval alleen wat nodig is. */
function makeCreateInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    displayName: "Achtertuin",
    locationDescription: "Zuidkant, 1.5m hoogte",
    timezone: "Europe/Amsterdam",
    macAddress: "AA:BB:CC:DD:EE:FF",
    expectedUploadIntervalSeconds: 60,
    stationIdentifier: "EASYWEATHERV1.6.8",
    ...overrides,
  };
}

describe("slugify", () => {
  it("maakt van een gewone naam een kleine-letter-slug met koppeltekens", () => {
    expect(slugify("Achtertuin - Zuidkant")).toBe("achtertuin-zuidkant");
  });

  it("vervangt diakritische tekens door hun basisvorm", () => {
    expect(slugify("Tuinhuisje (école)")).toBe("tuinhuisje-ecole");
  });

  it("verwijdert rand-koppeltekens en zet niet-alfanumerieke tekens om", () => {
    expect(slugify("  Straße 123  ")).toBe("stra-e-123");
  });

  it("knipt af op 140 tekens", () => {
    const result = slugify("a".repeat(200));
    expect(result.length).toBe(140);
  });
});

describe("createStationFormSchema", () => {
  it("accepteert geldige invoer", () => {
    const result = createStationFormSchema.safeParse(makeCreateInput());
    expect(result.success).toBe(true);
  });

  it("wijst een lege naam af", () => {
    const result = createStationFormSchema.safeParse(makeCreateInput({ displayName: "  " }));
    expect(result.success).toBe(false);
  });

  it("wijst een onbekende tijdzone af", () => {
    const result = createStationFormSchema.safeParse(
      makeCreateInput({ timezone: "Mars/Olympus_Mons" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepteert een geldige IANA-tijdzone anders dan Amsterdam", () => {
    const result = createStationFormSchema.safeParse(makeCreateInput({ timezone: "Pacific/Auckland" }));
    expect(result.success).toBe(true);
  });

  it("staat een leeg MAC-adres toe (optioneel) en zet een ingevulde waarde om naar hoofdletters", () => {
    const withoutMac = createStationFormSchema.safeParse(makeCreateInput({ macAddress: "" }));
    expect(withoutMac.success).toBe(true);
    if (withoutMac.success) {
      expect(withoutMac.data.macAddress).toBeUndefined();
    }

    const withMac = createStationFormSchema.safeParse(makeCreateInput({ macAddress: "aa:bb:cc:dd:ee:ff" }));
    expect(withMac.success).toBe(true);
    if (withMac.success) {
      expect(withMac.data.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    }
  });

  it("wijst een ongeldig MAC-adres af", () => {
    const result = createStationFormSchema.safeParse(makeCreateInput({ macAddress: "niet-een-mac" }));
    expect(result.success).toBe(false);
  });

  it("wijst een upload-interval buiten 30-3600 seconden af", () => {
    expect(
      createStationFormSchema.safeParse(makeCreateInput({ expectedUploadIntervalSeconds: 10 })).success,
    ).toBe(false);
    expect(
      createStationFormSchema.safeParse(makeCreateInput({ expectedUploadIntervalSeconds: 7200 }))
        .success,
    ).toBe(false);
  });

  it("wijst een niet-geheel upload-interval af", () => {
    const result = createStationFormSchema.safeParse(
      makeCreateInput({ expectedUploadIntervalSeconds: 60.5 }),
    );
    expect(result.success).toBe(false);
  });

  it("vereist een stationIdentifier", () => {
    const result = createStationFormSchema.safeParse(makeCreateInput({ stationIdentifier: "" }));
    expect(result.success).toBe(false);
  });

  it("wijst een te lange locatieomschrijving af", () => {
    const result = createStationFormSchema.safeParse(
      makeCreateInput({ locationDescription: "x".repeat(161) }),
    );
    expect(result.success).toBe(false);
  });
});

describe("updateStationFormSchema", () => {
  it("accepteert dezelfde velden als het aanmaakformulier", () => {
    const result = updateStationFormSchema.safeParse(makeCreateInput());
    expect(result.success).toBe(true);
  });
});

describe("testConnectionSchema", () => {
  it("accepteert een geldig MAC-adres en zet het om naar hoofdletters", () => {
    const result = testConnectionSchema.safeParse({ macAddress: "aa:bb:cc:dd:ee:ff" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    }
  });

  it("wijst een ontbrekend MAC-adres af", () => {
    const result = testConnectionSchema.safeParse({ macAddress: "" });
    expect(result.success).toBe(false);
  });
});

describe("describeDuplicateKeyError", () => {
  it("geeft undefined bij een fout die geen duplicate-key-fout is", () => {
    expect(describeDuplicateKeyError(new Error("iets anders ging mis"))).toBeUndefined();
  });

  it("herkent de slug-index", () => {
    expect(
      describeDuplicateKeyError(
        new Error("Duplicate entry 'achtertuin' for key 'stations.stations_slug_unique'"),
      ),
    ).toBe("Er bestaat al een station met (bijna) deze naam — kies een andere naam.");
  });

  it("herkent de station-identifier-index", () => {
    expect(
      describeDuplicateKeyError(
        new Error(
          "Duplicate entry 'EASYWEATHERV1.6.8' for key 'stations.stations_station_identifier_unique'",
        ),
      ),
    ).toBe("Deze identifier is al in gebruik bij een ander station.");
  });

  it("herkent de MAC-adres-index", () => {
    expect(
      describeDuplicateKeyError(
        new Error("Duplicate entry 'AA:BB:CC:DD:EE:FF' for key 'stations.stations_mac_address_unique'"),
      ),
    ).toBe("Dit MAC-adres is al gekoppeld aan een ander station.");
  });

  it("geeft een generieke melding voor een onbekende unieke index", () => {
    expect(
      describeDuplicateKeyError(new Error("Duplicate entry 'x' for key 'stations.some_other_unique'")),
    ).toBe("Deze waarde is al in gebruik bij een ander station.");
  });

  it("werkt ook met een niet-Error waarde", () => {
    expect(describeDuplicateKeyError("Duplicate entry 'x' for key 'stations.stations_slug_unique'")).toBe(
      "Er bestaat al een station met (bijna) deze naam — kies een andere naam.",
    );
  });
});
