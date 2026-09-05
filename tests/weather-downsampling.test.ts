import { describe, expect, it } from "vitest";

import { chooseAggregationInterval, intervalToSeconds } from "@/lib/weather/downsampling";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function rangeFrom(hoursAgo: number, now = new Date("2026-09-05T14:00:00.000Z")) {
  return { from: new Date(now.getTime() - hoursAgo * HOUR), to: now };
}

describe("chooseAggregationInterval", () => {
  it("gebruikt ruwe data voor 0-48 uur", () => {
    expect(
      chooseAggregationInterval(...(Object.values(rangeFrom(1)) as [Date, Date])),
    ).toBe("raw");
    expect(
      chooseAggregationInterval(...(Object.values(rangeFrom(24)) as [Date, Date])),
    ).toBe("raw");
    expect(
      chooseAggregationInterval(...(Object.values(rangeFrom(48)) as [Date, Date])),
    ).toBe("raw");
  });

  it("gebruikt 5-minuten-aggregatie kort na de 48-uursgrens (binnen het puntenbudget)", () => {
    const { from, to } = rangeFrom(3 * 24);
    expect(chooseAggregationInterval(from, to)).toBe("5m");
  });

  it("schaalt van 5m af naar hour zodra het puntenbudget overschreden zou worden (7 dagen op 5m = 2016 punten > 1500)", () => {
    const { from, to } = rangeFrom(7 * 24);
    expect(chooseAggregationInterval(from, to)).toBe("hour");
  });

  it("gebruikt uurwaarden voor 14-90 dagen", () => {
    const { from, to } = rangeFrom(30 * 24);
    expect(chooseAggregationInterval(from, to)).toBe("hour");
  });

  it("gebruikt dagwaarden boven 90 dagen", () => {
    const { from, to } = rangeFrom(200 * 24);
    expect(chooseAggregationInterval(from, to)).toBe("day");
  });

  it("een leeg/negatief bereik levert nooit een crash op (raw als degenerate geval)", () => {
    const now = new Date();
    expect(chooseAggregationInterval(now, now)).toBe("raw");
  });

  it("respecteert het puntenbudget: een zeer lang bereik met een klein budget valt terug op dagresolutie", () => {
    const from = new Date(Date.now() - 400 * DAY);
    const to = new Date();
    const interval = chooseAggregationInterval(from, to, { pointBudget: 500 });
    expect(interval).toBe("day");
  });

  it("houdt rekening met een korter pollinterval (toekomstbestendig) via minPollIntervalSeconds", () => {
    // Met een (hypothetisch) pollinterval van 60s in plaats van 300s zou 48
    // uur ruw > 1500 punten opleveren (2880), dus dan moet de functie eerder
    // afschalen dan bij het huidige 300s-interval.
    const { from, to } = rangeFrom(48);
    const withCurrentInterval = chooseAggregationInterval(from, to, {
      minPollIntervalSeconds: 300,
    });
    const withFasterInterval = chooseAggregationInterval(from, to, {
      minPollIntervalSeconds: 60,
    });
    expect(withCurrentInterval).toBe("raw");
    expect(withFasterInterval).not.toBe("raw");
  });
});

describe("intervalToSeconds", () => {
  it("geeft de juiste seconden per aggregatie-interval", () => {
    expect(intervalToSeconds("raw")).toBe(0);
    expect(intervalToSeconds("5m")).toBe(300);
    expect(intervalToSeconds("hour")).toBe(3600);
    expect(intervalToSeconds("day")).toBe(86400);
  });
});
