/**
 * Classificatie van de cronjob-gezondheid (Fase 3, `/station`-pagina) — zie
 * docs/AUTOMATIC_INGESTION.md voor de volledige achtergrond bij de gekozen
 * pollfrequentie (5 minuten, via een externe cronjob op cron-job.org die
 * `/api/weather/providers/ecowitt-cloud/<secret>` aanroept).
 *
 * GEDOCUMENTEERDE DREMPELS (zelf gekozen, niet officieel/gestandaardiseerd —
 * vergelijkbaar met de pressure-trend-drempel in trends.ts): gebaseerd op een
 * veelvoud van het pollinterval, zodat één gemiste poll (netwerkhikje,
 * Ecowitt-API-storing van een paar minuten) niet meteen als "offline"
 * aangemerkt wordt, maar een langere stilte wel zichtbaar is.
 * - "actief"    → laatste GESLAAGDE poll ≤ 2× pollinterval geleden.
 * - "vertraagd" → laatste geslaagde poll tussen 2× en 6× pollinterval
 *                 geleden (bv. 1-2 gemiste polls, of de Ecowitt Cloud API
 *                 gaf tijdelijk geen nieuwe meting terug).
 * - "offline"   → laatste geslaagde poll > 6× pollinterval geleden, of nooit.
 * - "onbekend"  → er is nog nooit gepolld (geen providerstatus-rij).
 */
export type CronHealthStatus = "actief" | "vertraagd" | "offline" | "onbekend";

/**
 * Nederlandse labels en badgekleur per status — gedeeld door `/station` en
 * de homepage, zodat beide pagina's dezelfde cron-gezondheid altijd
 * identiek weergeven (geen losse, uit sync te raken kopieën).
 */
export const CRON_STATUS_LABEL_NL: Record<CronHealthStatus, string> = {
  actief: "Actief",
  vertraagd: "Vertraagd",
  offline: "Offline",
  onbekend: "Onbekend",
};

export const CRON_STATUS_BADGE_VARIANT: Record<
  CronHealthStatus,
  "success" | "warning" | "danger" | "default"
> = {
  actief: "success",
  vertraagd: "warning",
  offline: "danger",
  onbekend: "default",
};

const DELAYED_THRESHOLD_MULTIPLIER = 2;
const OFFLINE_THRESHOLD_MULTIPLIER = 6;

export interface CronHealth {
  status: CronHealthStatus;
  /** Seconden sinds de laatste GESLAAGDE poll, of null als die nog nooit plaatsvond. */
  secondsSinceLastSuccess: number | null;
  /** Of de meest recente pollpoging (geslaagd of niet) een fout gaf. */
  lastAttemptFailed: boolean;
}

export function classifyCronHealth(
  input: {
    lastPolledAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
  },
  pollIntervalSeconds: number,
  now: Date = new Date(),
): CronHealth {
  const { lastPolledAt, lastSuccessAt, lastErrorAt } = input;

  const lastAttemptFailed = Boolean(
    lastErrorAt && (!lastPolledAt || lastErrorAt.getTime() >= lastPolledAt.getTime()),
  );

  if (!lastSuccessAt) {
    return { status: "onbekend", secondsSinceLastSuccess: null, lastAttemptFailed };
  }

  const secondsSinceLastSuccess = Math.max(
    0,
    Math.round((now.getTime() - lastSuccessAt.getTime()) / 1000),
  );

  let status: CronHealthStatus;
  if (secondsSinceLastSuccess <= pollIntervalSeconds * DELAYED_THRESHOLD_MULTIPLIER) {
    status = "actief";
  } else if (
    secondsSinceLastSuccess <=
    pollIntervalSeconds * OFFLINE_THRESHOLD_MULTIPLIER
  ) {
    status = "vertraagd";
  } else {
    status = "offline";
  }

  return { status, secondsSinceLastSuccess, lastAttemptFailed };
}
