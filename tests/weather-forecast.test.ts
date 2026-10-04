import { describe, expect, it } from "vitest";

import {
  buildForecastUrl,
  describeWeatherCode,
  parseForecastResponse,
} from "@/lib/weather/forecast";

describe("describeWeatherCode", () => {
  it("geeft Nederlandse omschrijvingen en passende iconen", () => {
    expect(describeWeatherCode(0)).toEqual({ label: "Zonnig", icon: "sun" });
    expect(describeWeatherCode(2)).toEqual({ label: "Half bewolkt", icon: "cloud-sun" });
    expect(describeWeatherCode(3)).toEqual({ label: "Bewolkt", icon: "cloud" });
    expect(describeWeatherCode(45).icon).toBe("fog");
    expect(describeWeatherCode(53).icon).toBe("drizzle");
    expect(describeWeatherCode(63)).toEqual({ label: "Regen", icon: "rain" });
    expect(describeWeatherCode(81).label).toBe("Regenbuien");
    expect(describeWeatherCode(73).icon).toBe("snow");
    expect(describeWeatherCode(95).icon).toBe("lightning");
  });

  it("valt bij een onbekende code terug op een neutrale omschrijving", () => {
    expect(describeWeatherCode(1234)).toEqual({ label: "Wisselend bewolkt", icon: "cloud-sun" });
  });
});

describe("parseForecastResponse", () => {
  const validResponse = {
    daily: {
      time: ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      weather_code: [3, 61, 0, 95, 45, 2],
      temperature_2m_max: [14.2, 12.8, 16.1, 15.0, 11.4, 13.0],
      temperature_2m_min: [8.1, 9.5, 7.2, 10.0, 6.3, 7.7],
    },
  };

  it("zet de respons om naar maximaal 5 dagen", () => {
    const days = parseForecastResponse(validResponse);
    expect(days).toHaveLength(5);
    expect(days[0]).toEqual({ date: "2026-10-04", weatherCode: 3, maxC: 14.2, minC: 8.1 });
    expect(days[4]?.date).toBe("2026-10-08");
  });

  it("slaat dagen zonder geldige weercode over en laat ontbrekende temperaturen null", () => {
    const days = parseForecastResponse({
      daily: {
        time: ["2026-10-04", "2026-10-05"],
        weather_code: [null, 61],
        temperature_2m_max: [10, null],
        temperature_2m_min: [5, 4],
      },
    });
    expect(days).toEqual([{ date: "2026-10-05", weatherCode: 61, maxC: null, minC: 4 }]);
  });

  it("geeft een lege lijst bij een ongeldige of onvolledige respons", () => {
    expect(parseForecastResponse(null)).toEqual([]);
    expect(parseForecastResponse("fout")).toEqual([]);
    expect(parseForecastResponse({})).toEqual([]);
    expect(parseForecastResponse({ daily: {} })).toEqual([]);
    expect(parseForecastResponse({ daily: { time: "2026-10-04", weather_code: [1] } })).toEqual(
      [],
    );
  });
});

describe("buildForecastUrl", () => {
  it("bouwt de Open-Meteo-URL met coördinaten, tijdzone en 5 dagen", () => {
    const url = new URL(buildForecastUrl(52.1, 5.18, "Europe/Amsterdam"));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("52.1000");
    expect(url.searchParams.get("longitude")).toBe("5.1800");
    expect(url.searchParams.get("timezone")).toBe("Europe/Amsterdam");
    expect(url.searchParams.get("forecast_days")).toBe("5");
    expect(url.searchParams.get("daily")).toBe(
      "weather_code,temperature_2m_max,temperature_2m_min",
    );
  });
});
