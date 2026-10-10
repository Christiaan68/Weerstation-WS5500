import { describe, expect, it } from "vitest";

import { runningRainTotal } from "@/lib/weather/rain-cumulative";

// Eenvoudige dagsleutel voor de test: elke 100 "tijdseenheden" is een nieuwe dag.
const dayKeyOf = (t: number) => String(Math.floor(t / 100));

describe("runningRainTotal", () => {
  it("geeft binnen één dag de stand van de dagteller zelf terug", () => {
    const out = runningRainTotal(
      [
        { t: 1, value: 2.0 },
        { t: 2, value: 2.2 },
        { t: 3, value: 2.5 },
      ],
      dayKeyOf,
    );
    expect(out).toEqual([2, 2.2, 2.5]); // nooit 6.7
  });

  it("telt bij een nieuwe dag de nieuwe stand erbij, ook als die hoger is dan de vorige dagstand", () => {
    const out = runningRainTotal(
      [
        { t: 10, value: 10 },
        { t: 110, value: 12 }, // nieuwe dag, begint al op 12 mm
        { t: 111, value: 13 },
      ],
      dayKeyOf,
    );
    expect(out).toEqual([10, 22, 23]);
  });

  it("telt bij dagbuckets (elk punt een eigen dag) de dagtotalen op", () => {
    const out = runningRainTotal(
      [
        { t: 0, value: 5 },
        { t: 100, value: 0 },
        { t: 200, value: 3.5 },
      ],
      dayKeyOf,
    );
    expect(out).toEqual([5, 5, 8.5]);
  });

  it("behandelt een onverwachte daling binnen een dag als reset (nooit negatief)", () => {
    const out = runningRainTotal(
      [
        { t: 1, value: 4 },
        { t: 2, value: 0.5 },
        { t: 3, value: 1 },
      ],
      dayKeyOf,
    );
    expect(out).toEqual([4, 4.5, 5]);
  });

  it("laat gaten (null) leeg en de lopende stand ongemoeid", () => {
    const out = runningRainTotal(
      [
        { t: 1, value: 1 },
        { t: 2, value: null },
        { t: 3, value: 1.5 },
      ],
      dayKeyOf,
    );
    expect(out).toEqual([1, null, 1.5]);
  });

  it("geeft een lege reeks terug voor lege invoer", () => {
    expect(runningRainTotal([], dayKeyOf)).toEqual([]);
  });
});
