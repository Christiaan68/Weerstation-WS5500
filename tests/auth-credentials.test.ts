/**
 * `src/lib/auth/credentials.ts` (Fase 7 — site-brede login) — toetst
 * `verifyCredentials()` tegen de verwachte gebruikersnaam/wachtwoord uit
 * `SITE_AUTH_USERNAME`/`SITE_AUTH_PASSWORD`.
 */
import { describe, expect, it } from "vitest";

import { verifyCredentials } from "@/lib/auth/credentials";

const EXPECTED_USERNAME = "beheerder";
const EXPECTED_PASSWORD = "correct-paardenbatterij-nietje-42";

describe("verifyCredentials", () => {
  it("keurt de juiste combinatie goed", () => {
    expect(
      verifyCredentials(EXPECTED_USERNAME, EXPECTED_PASSWORD, EXPECTED_USERNAME, EXPECTED_PASSWORD),
    ).toBe(true);
  });

  it("wijst een verkeerd wachtwoord af", () => {
    expect(
      verifyCredentials(EXPECTED_USERNAME, "verkeerd", EXPECTED_USERNAME, EXPECTED_PASSWORD),
    ).toBe(false);
  });

  it("wijst een verkeerde gebruikersnaam af", () => {
    expect(
      verifyCredentials("verkeerd", EXPECTED_PASSWORD, EXPECTED_USERNAME, EXPECTED_PASSWORD),
    ).toBe(false);
  });

  it("wijst beide verkeerd af", () => {
    expect(verifyCredentials("verkeerd", "ook verkeerd", EXPECTED_USERNAME, EXPECTED_PASSWORD)).toBe(
      false,
    );
  });

  it("wijst ontbrekende invoer af zonder te gooien", () => {
    expect(verifyCredentials(undefined, undefined, EXPECTED_USERNAME, EXPECTED_PASSWORD)).toBe(
      false,
    );
    expect(verifyCredentials(EXPECTED_USERNAME, undefined, EXPECTED_USERNAME, EXPECTED_PASSWORD)).toBe(
      false,
    );
  });

  it("wijst lege strings af", () => {
    expect(verifyCredentials("", "", EXPECTED_USERNAME, EXPECTED_PASSWORD)).toBe(false);
  });

  it("is hoofdlettergevoelig", () => {
    expect(
      verifyCredentials(
        EXPECTED_USERNAME.toUpperCase(),
        EXPECTED_PASSWORD,
        EXPECTED_USERNAME,
        EXPECTED_PASSWORD,
      ),
    ).toBe(false);
  });
});
