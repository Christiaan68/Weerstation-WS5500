import { afterEach, describe, expect, it, vi } from "vitest";

describe("withBasePath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("zet het basePath voor een pad", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/weerstation");
    vi.resetModules();
    const { BASE_PATH, withBasePath } = await import("@/lib/base-path");
    expect(BASE_PATH).toBe("/weerstation");
    expect(withBasePath("/api/weather/current?station=x")).toBe(
      "/weerstation/api/weather/current?station=x",
    );
  });

  it("laat het pad ongemoeid zonder basePath", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    vi.resetModules();
    const { BASE_PATH, withBasePath } = await import("@/lib/base-path");
    expect(BASE_PATH).toBe("");
    expect(withBasePath("/api/health")).toBe("/api/health");
  });
});
