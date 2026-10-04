import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGeocodeUrl,
  formatCoordinateName,
  forecastPlaceLabel,
  parseCoordinates,
  parseGeocodeResponse,
  resolveStationLocation,
  stripHouseNumber,
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
        address: {
          postcode: "1011 AB",
          city: "Amsterdam",
          municipality: "Amsterdam",
          country: "Nederland",
        },
      },
    ]);
    expect(result).toEqual({
      latitude: 52.3777964,
      longitude: 4.9056499,
      name: "1011 AB, Amsterdam",
    });
  });

  it("neemt bij een adres straat, huisnummer en plaats op (zonder postcode en land)", () => {
    const result = parseGeocodeResponse([
      {
        lat: "52.3731",
        lon: "4.8926",
        address: {
          house_number: "1",
          road: "Dam",
          postcode: "1012 JS",
          city: "Amsterdam",
          country: "Nederland",
        },
      },
    ]);
    expect(result?.name).toBe("Dam 1, Amsterdam");
  });

  it("toont alleen de straat als er geen huisnummer is, en kent ook pedestrian/footway", () => {
    expect(
      parseGeocodeResponse([
        { lat: "52.1", lon: "5.1", address: { road: "Kerkstraat", town: "Zierikzee" } },
      ])?.name,
    ).toBe("Kerkstraat, Zierikzee");
    expect(
      parseGeocodeResponse([
        { lat: "52.1", lon: "5.1", address: { pedestrian: "Domplein", house_number: "1", city: "Utrecht" } },
      ])?.name,
    ).toBe("Domplein 1, Utrecht");
  });

  it("gebruikt town/village als er geen city is", () => {
    const result = parseGeocodeResponse([
      {
        lat: "51.6497688",
        lon: "3.9208365",
        address: { town: "Zierikzee", municipality: "Schouwen-Duiveland", country: "Nederland" },
      },
    ]);
    expect(result?.name).toBe("Zierikzee");
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
    expect(result).toEqual({ latitude: 51.65, longitude: 3.92, name: "Zierikzee" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("nominatim.openstreetmap.org/search");
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("weerstation.tenhaaken.nl");
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


describe("stripHouseNumber", () => {
  it("haalt een huisnummer uit een adres", () => {
    expect(stripHouseNumber("Kerkstraat 5, Zierikzee")).toBe("Kerkstraat Zierikzee");
    expect(stripHouseNumber("Kerkstraat 12a Zierikzee")).toBe("Kerkstraat Zierikzee");
    expect(stripHouseNumber("Kerkstraat 12 a, Zierikzee")).toBe("Kerkstraat Zierikzee");
    expect(stripHouseNumber("Kerkstraat 12-14, Zierikzee")).toBe("Kerkstraat Zierikzee");
  });

  it("laat een postcode en een getal aan het begin van de straatnaam met rust", () => {
    expect(stripHouseNumber("1011 AB")).toBeNull();
    expect(stripHouseNumber("Amsterdam 1011 AB")).toBeNull();
    expect(stripHouseNumber("2e Weteringdwarsstraat, Amsterdam")).toBeNull();
    expect(stripHouseNumber("Amsterdam")).toBeNull();
  });

  it("haalt het huisnummer uit 'postcode huisnummer'", () => {
    expect(stripHouseNumber("1011 AB 12")).toBe("1011 AB");
  });
});

describe("forecastPlaceLabel", () => {
  it("houdt alleen de plaats over uit een adres of postcodenaam", () => {
    expect(forecastPlaceLabel("Dam 1, Amsterdam")).toBe("Amsterdam");
    expect(forecastPlaceLabel("1011 AB, Amsterdam")).toBe("Amsterdam");
    expect(forecastPlaceLabel("Zierikzee")).toBe("Zierikzee");
  });

  it("negeert een achtervoegsel 'Nederland' uit oudere waarden", () => {
    expect(forecastPlaceLabel("Amsterdam, Nederland")).toBe("Amsterdam");
  });

  it("geeft null bij leeg of alleen coördinaten", () => {
    expect(forecastPlaceLabel(null)).toBeNull();
    expect(forecastPlaceLabel("  ")).toBeNull();
    expect(forecastPlaceLabel("52.3676, 4.9041")).toBeNull();
  });
});

describe("resolveStationLocation — volledig adres", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("zoekt een adres als vrije tekst en bewaart straat, huisnummer en plaats", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            lat: "52.3731",
            lon: "4.8926",
            address: { house_number: "1", road: "Dam", city: "Amsterdam", postcode: "1012 JS" },
          },
        ]),
        { status: 200 },
      ),
    );
    const result = await resolveStationLocation("Dam 1, Amsterdam");
    expect(result).toEqual({ latitude: 52.3731, longitude: 4.8926, name: "Dam 1, Amsterdam" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchSpy.mock.calls[0]![0])).searchParams.get("q")).toBe(
      "Dam 1, Amsterdam",
    );
  });

  it("probeert opnieuw zonder huisnummer als het adres niet gevonden wordt", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { lat: "51.65", lon: "3.92", address: { road: "Kerkstraat", town: "Zierikzee" } },
          ]),
          { status: 200 },
        ),
      );
    const result = await resolveStationLocation("Kerkstraat 5, Zierikzee", { retryDelayMs: 0 });
    expect(result).toEqual({ latitude: 51.65, longitude: 3.92, name: "Kerkstraat, Zierikzee" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchSpy.mock.calls[1]![0])).searchParams.get("q")).toBe(
      "Kerkstraat Zierikzee",
    );
  });

  it("geeft null als ook de tweede poging niets oplevert", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("[]", { status: 200 }));
    expect(await resolveStationLocation("Kerkstraat 5, Nergens", { retryDelayMs: 0 })).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("probeert niet opnieuw bij een netwerkfout of zonder huisnummer", async () => {
    const failing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("netwerk weg"));
    expect(await resolveStationLocation("Kerkstraat 5, Zierikzee", { retryDelayMs: 0 })).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
    failing.mockRestore();

    const empty = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("[]", { status: 200 }));
    expect(await resolveStationLocation("Nergens", { retryDelayMs: 0 })).toBeNull();
    expect(empty).toHaveBeenCalledTimes(1);
  });
});
