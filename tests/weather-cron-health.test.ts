import { describe, expect, it } from "vitest";

import { classifyCronHealth } from "@/lib/weather/cron-health";

const NOW = new Date("2026-09-05T14:00:00.000Z");
const POLL_INTERVAL = 300; // 5 minuten

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("classifyCronHealth", () => {
  it("is 'onbekend' zonder ooit een geslaagde poll", () => {
    const result = classifyCronHealth(
      { lastPolledAt: null, lastSuccessAt: null, lastErrorAt: null },
      POLL_INTERVAL,
      NOW,
    );
    expect(result.status).toBe("onbekend");
    expect(result.secondsSinceLastSuccess).toBeNull();
  });

  it("is 'actief' binnen 2x het pollinterval (10 minuten)", () => {
    const result = classifyCronHealth(
      { lastPolledAt: minutesAgo(4), lastSuccessAt: minutesAgo(4), lastErrorAt: null },
      POLL_INTERVAL,
      NOW,
    );
    expect(result.status).toBe("actief");
  });

  it("is 'vertraagd' tussen 2x en 6x het pollinterval (bv. 20 minuten)", () => {
    const result = classifyCronHealth(
      { lastPolledAt: minutesAgo(20), lastSuccessAt: minutesAgo(20), lastErrorAt: null },
      POLL_INTERVAL,
      NOW,
    );
    expect(result.status).toBe("vertraagd");
  });

  it("is 'offline' voorbij 6x het pollinterval (bv. 45 minuten)", () => {
    const result = classifyCronHealth(
      { lastPolledAt: minutesAgo(45), lastSuccessAt: minutesAgo(45), lastErrorAt: null },
      POLL_INTERVAL,
      NOW,
    );
    expect(result.status).toBe("offline");
  });

  it("signaleert een mislukte MEEST RECENTE pollpoging, ook als een eerdere poll wel slaagde", () => {
    const result = classifyCronHealth(
      {
        lastPolledAt: minutesAgo(1),
        lastSuccessAt: minutesAgo(4),
        lastErrorAt: minutesAgo(1),
      },
      POLL_INTERVAL,
      NOW,
    );
    expect(result.status).toBe("actief"); // laatste succes is nog recent genoeg
    expect(result.lastAttemptFailed).toBe(true); // maar de allerlaatste poging faalde
  });

  it("meldt geen mislukte poging als de laatste fout van vóór het laatste succes dateert", () => {
    const result = classifyCronHealth(
      {
        lastPolledAt: minutesAgo(1),
        lastSuccessAt: minutesAgo(1),
        lastErrorAt: minutesAgo(30),
      },
      POLL_INTERVAL,
      NOW,
    );
    expect(result.lastAttemptFailed).toBe(false);
  });
});
