import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGeocodeUrl,
  formatCoordinateName,
  parseCoordinates,
  parseGeocodeResponse,
  resolveStationLocation,
} from "@/lib/weather/geocode";

describe("parseCoordinates", () => {
  it("herkent 'lat, lon' met komma", () => {
    expect(parseCoordinates("52.3676, 4.9041")).toEqual({ latitude: 52.3676, longitude: 4.9041 });
  });

  it("herkent puntkomma, alleen spatie en negatieve waarden", () => {
    expect(parseCoordinates("52.37;4.89")).toEqual({ latitude: 52.37, longitude: 4.89 });
    expect(parseCoordinates("52.37 4.89")).toEqual({ latitude: 52.37, longitude: 4.89 });
    expect(parseCoordinates("-33.8688, 151.2093")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
  });

  it("wijst waarden buiten het geldige bereik af", () => {
    expect(parseCoordinates("95, 4.9")).toBeNull();
    expect(parseCoordinates("52.3, 190")).toBeNull();
  });

  it("neemt een postcode of plaatsnaam niet aan voor coördinaten", () => {
    expect(parseCoordinates("1011 AB")).toBeNull();
    expect(parseCoordinates("Amsterdam")).toBeNull();
    expect(parseCoordinates("1011")).toBeNull();
  });
});

describe("formatCoordinateName", () => {
  it("rondt af op vier decimalen", () => {
    expect(formatCoordinateName(52.37403, 4.88969)).toBe("52.3740, 4.8897");
  });
});

describe("buildGeocodeUrl", () => {
  it("bouwt een Nominatim-zoekopdracht met de zoektekst", () => {
    const url = new URL(buildGeocodeUrl("1011 AB"));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("1011 AB");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("accept-language")).toBe("nl");
    // Zonder landfilter vindt "1011 AB" een adres in Canada — zie geocode.ts.
    expect(url.searchParams.get("countrycodes")).toBe("nl");
  });
});

describe("parseGeocodeResponse", () => {
  it("maakt van een postcode-resultaat een leesbare plaatsnaam", () => {
    const result = parseGeocodeResponse([
      {
        lat: "52.3777964",
        lon: "4.9056499",
        display_name: "1011 AB, Nieuwmarkt/Lastage, Centrum, Amsterdam, Noord-Holland, Nederland",
        address: { city: "Amsterdam", municipality: "Amsterdam", country: "Nederland" },
      },
    ]);
    expect(result).toEqual({
      latitude: 52.3777964,
      longitude: 4.9056499,
      name: "Amsterdam, Nederland",
    });
  });

  it("gebruikt town/village als er geen city is", () => {
    const result = parseGeocodeResponse([
      {
        lat: "51.6497688",
        lon: "3.9208365",
        address: { town: "Zierikzee", municipality: "Schouwen-Duiveland", country: "Nederland" },
      },
    ]);
    expect(result?.name).toBe("Zierikzee, Nederland");
  });

  it("valt terug op display_name en daarna op coördinaten", () => {
    expect(
      parseGeocodeResponse([{ lat: "52.1", lon: "5.2", display_name: "Ergens, Nederland" }])?.name,
    ).toBe("Ergens, Nederland");
    expect(parseGeocodeResponse([{ lat: "52.1", lon: "5.2" }])?.name).toBe("52.1000, 5.2000");
  });

  it("geeft null bij geen of ongeldig resultaat", () => {
    expect(parseGeocodeResponse([])).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse({})).toBeNull();
    expect(parseGeocodeResponse([{ lat: "x", lon: "y" }])).toBeNull();
  });
});

describe("resolveStationLocation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("geeft null bij lege invoer, zonder netwerk", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await resolveStationLocation("   ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lost coördinaten direct op, zonder netwerk", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await resolveStationLocation("52.3676, 4.9041")).toEqual({
      latitude: 52.3676,
      longitude: 4.9041,
      name: "52.3676, 4.9041",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("zoekt een plaatsnaam op via Nominatim met een identificerende User-Agent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { lat: "51.65", lon: "3.92", address: { town: "Zierikzee", country: "Nederland" } },
        ]),
        { status: 200 },
      ),
    );
    const result = await resolveStationLocation("Zierikzee");
    expect(result).toEqual({ latitude: 51.65, longitude: 3.92, name: "Zierikzee, Nederland" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("nominatim.openstreetmap.org/search");
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("mijnweerstation.nl");
    // Geen e-mailadres van de gebruiker in verzoekheaders.
    expect(headers["User-Agent"]).not.toContain("@");
  });

  it("geeft null bij een HTTP-fout of netwerkfout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nee", { status: 503 }));
    expect(await resolveStationLocation("Amsterdam")).toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("netwerk weg"));
    expect(await resolveStationLocation("Amsterdam")).toBeNull();
  });
});
