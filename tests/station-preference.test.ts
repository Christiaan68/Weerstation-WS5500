import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  getStation: vi.fn(),
  hasValidSession: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/auth/session-cookie", () => ({ hasValidSession: mocks.hasValidSession }));
vi.mock("@/lib/db/queries", () => ({ getStation: mocks.getStation }));
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ SITE_AUTH_SESSION_SECRET: "test" }),
}));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "session",
  verifySessionToken: (token: string) => token === "valid",
}));

import proxy from "@/proxy";
import { selectStation } from "@/app/station/actions";

function visit(station?: string, path = "/dashboard", authenticated = true) {
  const cookie = [
    authenticated ? "session=valid" : "",
    station ? `weather_station=${station}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return proxy(
    new NextRequest(`https://weather.example${path}`, { headers: { cookie } }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasValidSession.mockResolvedValue(true);
});

describe("independent browser station preferences", () => {
  it("keeps Marion in Sneek while another browser chooses another station", () => {
    expect(visit("marion").headers.get("location")).toBe(
      "https://weather.example/dashboard?station=marion",
    );
    expect(visit("achtertuin").headers.get("location")).toBe(
      "https://weather.example/dashboard?station=achtertuin",
    );
    expect(visit("marion").headers.get("location")).toBe(
      "https://weather.example/dashboard?station=marion",
    );
    expect(visit().headers.get("location")).toBeNull();
  });
  it("preserves explicit links and other filters without rewriting preferences", () => {
    expect(
      visit("marion", "/data?station=achtertuin").headers.get("location"),
    ).toBeNull();
    expect(visit("marion", "/regen?period=week").headers.get("location")).toBe(
      "https://weather.example/regen?period=week&station=marion",
    );
    expect(visit("marion").headers.get("set-cookie")).toBeNull();
  });
  it("keeps API calls and authentication unchanged", () => {
    expect(visit("marion", "/api/weather/current").headers.get("location")).toBeNull();
    expect(visit("marion", "/dashboard", false).headers.get("location")).toContain(
      "/login?",
    );
  });
  it.each(["marion", "achtertuin"])(
    "remembers %s using only this browser's cookie",
    async (slug) => {
      mocks.getStation.mockResolvedValue({ slug, isActive: true });
      const form = new FormData();
      form.set("station", slug);
      await expect(selectStation(form)).rejects.toThrow(
        `redirect:/station?station=${slug}`,
      );
      expect(mocks.set).toHaveBeenCalledWith(
        "weather_station",
        slug,
        expect.objectContaining({
          httpOnly: true,
          maxAge: 31536000,
          path: "/",
          sameSite: "lax",
        }),
      );
    },
  );
  it("does not save missing or inactive stations", async () => {
    mocks.getStation.mockResolvedValue({ slug: "old", isActive: false });
    const form = new FormData();
    form.set("station", "old");
    await selectStation(form);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated changes", async () => {
    mocks.hasValidSession.mockResolvedValue(false);
    await expect(selectStation(new FormData())).rejects.toThrow("redirect:/login");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
