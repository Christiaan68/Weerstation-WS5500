/**
 * `src/lib/auth/session.ts` (Fase 7 — site-brede login) — toetst het
 * ondertekenen/verifiëren van de sessiecookie-waarde: geldig token,
 * verlopen token, geknoeid token (andere payload of andere handtekening),
 * verkeerde sleutel, en een aantal ongeldige/lege inputs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "test-sessiegeheim-minimaal-32-tekens-lang";
const OTHER_SECRET = "een-heel-ander-sessiegeheim-ook-lang-genoeg";

describe("createSessionToken / verifySessionToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keurt een net aangemaakt token goed", () => {
    const token = createSessionToken(SECRET);
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("keurt een token nog goed vlak vóór het verloopt", () => {
    const token = createSessionToken(SECRET);
    vi.setSystemTime(new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000 - 1000));
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("wijst een verlopen token af", () => {
    const token = createSessionToken(SECRET);
    vi.setSystemTime(new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000 + 1000));
    expect(verifySessionToken(token, SECRET)).toBe(false);
  });

  it("wijst een token af dat met een andere sleutel geverifieerd wordt", () => {
    const token = createSessionToken(SECRET);
    expect(verifySessionToken(token, OTHER_SECRET)).toBe(false);
  });

  it("wijst een geknoeide payload af (vervaltijd zelf aangepast)", () => {
    const token = createSessionToken(SECRET);
    const [payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    const tamperedPayload = Buffer.from(
      JSON.stringify({ exp: decoded.exp + 1000 * 60 * 60 * 24 * 365 }),
    ).toString("base64url");

    expect(verifySessionToken(`${tamperedPayload}.${signature}`, SECRET)).toBe(false);
  });

  it("wijst een geknoeide handtekening af", () => {
    const token = createSessionToken(SECRET);
    const [payload] = token.split(".");
    expect(verifySessionToken(`${payload}.dGVzdA`, SECRET)).toBe(false);
  });

  it("wijst een compleet verzonnen token af", () => {
    expect(verifySessionToken("iets.verzonnens", SECRET)).toBe(false);
  });

  it("wijst een token zonder punt-scheidingsteken af", () => {
    expect(verifySessionToken("geenscheidingsteken", SECRET)).toBe(false);
  });

  it("wijst undefined/lege string af zonder te gooien", () => {
    expect(verifySessionToken(undefined, SECRET)).toBe(false);
    expect(verifySessionToken("", SECRET)).toBe(false);
  });

  it("geeft elke keer een ander token (bevat een vervaltijd, geen vast geheim)", () => {
    const tokenA = createSessionToken(SECRET);
    vi.advanceTimersByTime(1000);
    const tokenB = createSessionToken(SECRET);
    expect(tokenA).not.toBe(tokenB);
  });
});
