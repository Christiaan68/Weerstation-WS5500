import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `src/lib/env.ts` valideert `process.env` en cachet het resultaat in
 * module-scope variabelen. Om verschillende scenario's (ontbrekende
 * variabele, ongeldige waarde, standaardwaarden) te kunnen testen, resetten
 * we vóór elke test de module-cache en importeren we het bestand opnieuw
 * met een schone `process.env`.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getServerEnv", () => {
  it("gooit een duidelijke fout als DATABASE_URL ontbreekt", async () => {
    delete process.env.DATABASE_URL;

    const { getServerEnv } = await import("@/lib/env");

    expect(() => getServerEnv()).toThrowError(/DATABASE_URL/);
  });

  it("geeft de gevalideerde waarden terug als alles correct is ingevuld", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:4000/weerstation";

    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();

    expect(env.DATABASE_URL).toBe("mysql://user:pass@localhost:4000/weerstation");
  });

  it("behandelt lege optionele variabelen (zoals in .env.example) als niet ingesteld", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:4000/weerstation";
    process.env.ECOWITT_APPLICATION_KEY = "";
    process.env.ECOWITT_API_KEY = "";
    process.env.ECOWITT_DEVICE_MAC = "";
    process.env.WEATHER_INGEST_SECRET = "";

    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();

    expect(env.ECOWITT_APPLICATION_KEY).toBeUndefined();
    expect(env.ECOWITT_API_KEY).toBeUndefined();
    expect(env.ECOWITT_DEVICE_MAC).toBeUndefined();
    expect(env.WEATHER_INGEST_SECRET).toBeUndefined();
  });

  it("cachet het resultaat: een latere wijziging van process.env heeft geen effect", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:4000/weerstation";

    const { getServerEnv } = await import("@/lib/env");
    getServerEnv();

    process.env.DATABASE_URL = "mysql://iets-anders:pass@localhost:4000/weerstation";
    const env = getServerEnv();

    expect(env.DATABASE_URL).toBe("mysql://user:pass@localhost:4000/weerstation");
  });
});

describe("publicEnv", () => {
  it("gebruikt standaardwaarden als NEXT_PUBLIC_* niet gezet zijn", async () => {
    delete process.env.NEXT_PUBLIC_STATION_NAME;
    delete process.env.NEXT_PUBLIC_TIMEZONE;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;

    const { publicEnv } = await import("@/lib/env");

    expect(publicEnv.NEXT_PUBLIC_STATION_NAME).toBe("Alecto WS5500");
    expect(publicEnv.NEXT_PUBLIC_TIMEZONE).toBe("Europe/Amsterdam");
    expect(publicEnv.NEXT_PUBLIC_DEMO_MODE).toBe(false);
  });

  it("zet de string 'true' om naar een boolean", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    const { publicEnv } = await import("@/lib/env");

    expect(publicEnv.NEXT_PUBLIC_DEMO_MODE).toBe(true);
  });

  it("respecteert een aangepaste stationsnaam en tijdzone", async () => {
    process.env.NEXT_PUBLIC_STATION_NAME = "Mijn Alecto WS5500";
    process.env.NEXT_PUBLIC_TIMEZONE = "Europe/Amsterdam";

    const { publicEnv } = await import("@/lib/env");

    expect(publicEnv.NEXT_PUBLIC_STATION_NAME).toBe("Mijn Alecto WS5500");
  });
});
