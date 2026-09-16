"use server";

/**
 * Server Actions voor `/login` (Fase 7 — site-brede login).
 */
import { redirect } from "next/navigation";

import { verifyCredentials } from "@/lib/auth/credentials";
import { clearSessionCookie, createSessionCookie } from "@/lib/auth/session-cookie";
import { getServerEnv } from "@/lib/env";

export interface LoginActionState {
  error?: string;
}

/**
 * Voorkomt een "open redirect": `next` mag alleen een pad BINNEN deze site
 * zijn. Een waarde die met `//` begint zou een browser als protocol-relatieve
 * URL naar een andere host interpreteren (bv. `//evil.example`), en een
 * absolute `http(s)://`-URL zou nooit met een enkele `/` beginnen.
 */
function safeNextPath(next: FormDataEntryValue | null): string {
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/dashboard";
}

/** Kleine, opzettelijke vertraging bij een mislukte inlogpoging — geen
 * volwaardige rate-limiting (dat zou IP-tracking/een database vereisen voor
 * één account, disproportioneel voor een persoonlijke site), maar remt
 * geautomatiseerd gokken enigszins af. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function login(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const usernameInput = formData.get("username");
  const passwordInput = formData.get("password");
  const next = safeNextPath(formData.get("next"));

  const { SITE_AUTH_USERNAME, SITE_AUTH_PASSWORD } = getServerEnv();

  const ok = verifyCredentials(
    typeof usernameInput === "string" ? usernameInput : undefined,
    typeof passwordInput === "string" ? passwordInput : undefined,
    SITE_AUTH_USERNAME,
    SITE_AUTH_PASSWORD,
  );

  if (!ok) {
    await delay(400);
    // Bewust generiek (niet "gebruikersnaam onjuist" vs. "wachtwoord
    // onjuist"): dat zou verklappen of de gebruikersnaam al bestaat.
    return { error: "Onjuiste gebruikersnaam of wachtwoord." };
  }

  await createSessionCookie();
  redirect(next);
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
