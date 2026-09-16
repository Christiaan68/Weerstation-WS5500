/**
 * Vergelijkt ingevoerde inloggegevens met de verwachte waarden uit
 * `SITE_AUTH_USERNAME`/`SITE_AUTH_PASSWORD` (zie `src/lib/env.ts`). Gebruikt
 * door `src/app/login/actions.ts`.
 */
import { secretMatches } from "@/lib/weather/secret";

export function verifyCredentials(
  usernameInput: string | undefined,
  passwordInput: string | undefined,
  expectedUsername: string,
  expectedPassword: string,
): boolean {
  // Met `&` i.p.v. `&&` zodat ALTIJD beide constant-tijd vergelijkingen
  // uitgevoerd worden, ook als de gebruikersnaam al fout is — anders zou
  // een timingverschil (vroegtijdig stoppen na de gebruikersnaam) in
  // theorie kunnen verklappen of de gebruikersnaam op zich al correct was.
  const usernameOk = secretMatches(usernameInput, expectedUsername);
  const passwordOk = secretMatches(passwordInput, expectedPassword);
  return usernameOk && passwordOk;
}
