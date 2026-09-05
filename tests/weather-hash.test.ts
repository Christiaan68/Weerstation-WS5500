import { describe, expect, it } from "vitest";

import { hashPayload } from "@/lib/weather/hash";

describe("hashPayload", () => {
  it("geeft dezelfde hash voor dezelfde inhoud, ongeacht sleutelvolgorde", () => {
    const a = hashPayload({ tempf: "42.0", humidity: "80", PASSKEY: "ABC" });
    const b = hashPayload({ PASSKEY: "ABC", humidity: "80", tempf: "42.0" });

    expect(a).toBe(b);
  });

  it("geeft een andere hash zodra één waarde verandert", () => {
    const a = hashPayload({ tempf: "42.0", humidity: "80" });
    const b = hashPayload({ tempf: "42.1", humidity: "80" });

    expect(a).not.toBe(b);
  });

  it("geeft een andere hash als dateutc verschilt (twee losse, legitieme metingen botsen niet)", () => {
    const a = hashPayload({ dateutc: "2026-01-15 10:00:00", tempf: "42.0" });
    const b = hashPayload({ dateutc: "2026-01-15 10:01:00", tempf: "42.0" });

    expect(a).not.toBe(b);
  });

  it("is deterministisch: dezelfde aanroep geeft altijd dezelfde hash", () => {
    const payload = { tempf: "42.0", humidity: "80", dateutc: "2026-01-15 10:00:00" };
    expect(hashPayload(payload)).toBe(hashPayload(payload));
  });

  it("geeft een 64 tekens lange hexadecimale SHA-256-hash", () => {
    const hash = hashPayload({ tempf: "42.0" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
