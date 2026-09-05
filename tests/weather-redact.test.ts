import { describe, expect, it } from "vitest";

import { maskSecretValue, sanitizePayloadForDisplay } from "@/lib/weather/redact";

describe("sanitizePayloadForDisplay", () => {
  it("verbergt PASSKEY volledig uit de weergave", () => {
    const result = sanitizePayloadForDisplay({
      PASSKEY: "abcdef1234567890",
      tempf: "42.0",
    }) as Record<string, unknown>;

    expect(String(result.PASSKEY)).not.toContain("abcdef1234567890");
    expect(result.tempf).toBe("42.0");
  });

  it("verbergt ook een wachtwoord-achtig veld (Wunderground-protocol)", () => {
    const result = sanitizePayloadForDisplay({
      ID: "STATION1",
      PASSWORD: "geheim123",
    }) as Record<string, unknown>;

    expect(String(result.PASSWORD)).not.toContain("geheim123");
    expect(result.ID).toBe("STATION1");
  });

  it("werkt ook op geneste objecten (bv. Ecowitt Cloud-respons)", () => {
    const result = sanitizePayloadForDisplay({
      data: {
        application_key: "supersecretkey12345",
        outdoor: { temperature: { value: "5.0" } },
      },
    }) as { data: Record<string, unknown> };

    expect(String(result.data.application_key)).not.toContain("supersecretkey12345");
    expect((result.data.outdoor as Record<string, unknown>).temperature).toEqual({
      value: "5.0",
    });
  });

  it("laat niet-gevoelige velden ongewijzigd", () => {
    const input = { tempf: "42.0", humidity: "80" };
    expect(sanitizePayloadForDisplay(input)).toEqual(input);
  });
});

describe("maskSecretValue", () => {
  it("toont alleen de eerste en laatste twee tekens van een lange waarde", () => {
    const masked = maskSecretValue("ABCDEFGHIJKL");
    expect(masked).toContain("AB");
    expect(masked).toContain("KL");
    expect(masked).not.toContain("CDEFGHIJ");
  });

  it("verbergt een korte waarde volledig (geen bruikbare informatie in 2 tekens)", () => {
    const masked = maskSecretValue("AB1234");
    expect(masked).not.toContain("AB1234");
  });
});
