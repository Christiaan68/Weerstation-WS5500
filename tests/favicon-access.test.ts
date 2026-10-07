import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "@/proxy";

describe("favicon access", () => {
  for (const basePath of ["", "/weerstation"]) {
    it.each([
      "/icon.svg",
      "/icon.svg?v=1",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
    ])(`serves %s without a session (basePath=${basePath})`, (path) => {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig: { basePath },
          url: `${basePath}${path}`,
        }),
      ).toBe(false);
    });
    it.each([
      "/dashboard",
      "/admin/stations",
      "/api/weather/current",
      "/icon.svg/private",
      "/icon.svg-other",
    ])(`keeps %s protected (basePath=${basePath})`, (path) => {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          nextConfig: { basePath },
          url: `${basePath}${path}`,
        }),
      ).toBe(true);
    });
  }
});
