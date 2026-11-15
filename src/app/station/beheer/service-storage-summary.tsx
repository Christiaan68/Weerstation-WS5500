import {
  getServiceStorage,
  getSqlDistribution,
  storageWarning,
} from "@/lib/db/service-storage";
import {
  buildStorageBreakdown,
  type StorageSliceKind,
} from "@/lib/weather/storage-breakdown";
import { formatStorageBytes, formatStoragePercent } from "@/lib/weather/storage-format";
import { storageReminder } from "@/lib/weather/storage-reminder";
import { StorageRefresh } from "./storage-refresh";

const SLICE_STYLE: Record<
  StorageSliceKind,
  { label: string; color: string; dot: string }
> = {
  weather: {
    label: "Weerstation (schatting)",
    color: "bg-sky-500",
    dot: "bg-sky-500",
  },
  other: {
    label: "Overige zichtbare databases (schatting)",
    color: "bg-violet-500",
    dot: "bg-violet-500",
  },
  overhead: {
    label: "Overige schijfruimte / overhead",
    color: "bg-amber-500",
    dot: "bg-amber-500",
  },
  used: {
    label: "Totaal gebruikt (niet uitgesplitst)",
    color: "bg-sky-500",
    dot: "bg-sky-500",
  },
  free: {
    label: "Nog beschikbaar (ca.)",
    color: "bg-slate-200 dark:bg-slate-700",
    dot: "bg-slate-300 dark:bg-slate-600",
  },
};

export async function ServiceStorageSummary() {
  const [service, sql] = await Promise.all([getServiceStorage(), getSqlDistribution()]);
  const warning = storageWarning(service.percent);
  const breakdown = buildStorageBreakdown(service.limitBytes, service.percent, sql);
  const reminder = storageReminder(process.env.AIVEN_STORAGE_REVIEW_DATE ?? "2026-12-03");
  // Dynamic server render: send an expiry deadline to the browser, not its clock.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  return (
    <StorageRefresh
      expiresAt={Math.min(
        renderedAt + 15 * 60_000,
        service.measuredAt ? Date.parse(service.measuredAt) + 15 * 60_000 : Infinity,
      )}
    >
      <section className="space-y-4" aria-label="Aiven-opslag">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">
              Abonnementsruimte · Aiven (maximum)
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {service.limitBytes === null
                ? "Niet opgehaald"
                : formatStorageBytes(service.limitBytes, 2)}
            </p>
            {service.limitBytes !== null && (
              <p className="text-muted-foreground text-xs">
                {new Intl.NumberFormat("nl-NL", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(service.limitBytes / 1024 ** 3)}{" "}
                GiB (Aiven rekent in MiB/GiB)
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              Werkelijk schijfgebruik · Aiven
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {service.percent === null
                ? "Meting onbekend of onbetrouwbaar"
                : formatStoragePercent(service.percent)}
            </p>
            {breakdown && (
              <p className="text-muted-foreground text-sm">
                {formatStorageBytes(breakdown.usedBytes, 2)} gebruikt
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Nog beschikbaar (ca.)</p>
            <p className="text-2xl font-semibold tabular-nums">
              {breakdown
                ? `ca. ${formatStorageBytes(breakdown.freeBytes, 2)}`
                : "Niet beschikbaar"}
            </p>
          </div>
        </div>

        {breakdown ? (
          <div className="space-y-3">
            <div
              role="progressbar"
              aria-label="Aiven-opslag: gebruikt en beschikbaar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={service.percent!}
              aria-valuetext={`${formatStoragePercent(service.percent!)} gebruikt, ${formatStorageBytes(breakdown.freeBytes)} beschikbaar`}
              className="bg-muted flex h-4 w-full overflow-hidden rounded-full"
            >
              {breakdown.slices.map((slice) => (
                <div
                  key={slice.kind}
                  aria-hidden="true"
                  className={`h-full shrink-0 ${SLICE_STYLE[slice.kind].color}`}
                  style={{ width: `${slice.percent}%` }}
                />
              ))}
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {breakdown.slices.map((slice) => (
                <div key={slice.kind} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-sm ${SLICE_STYLE[slice.kind].dot}`}
                    aria-hidden="true"
                  />
                  <dt className="text-muted-foreground flex-1">
                    {SLICE_STYLE[slice.kind].label}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatStorageBytes(slice.bytes, 2)}
                  </dd>
                </div>
              ))}
            </dl>
            {breakdown.mode === "detailed" ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Weerstation en overige databases zijn schattingen van SQL-tabel- en
                indexruimte. De andere gebruikte schijfruimte omvat onder andere
                MySQL-bestanden, logs en niet-toegerekende opslag. Aiven bepaalt het
                totale schijfgebruik. Vrije ruimte is daaruit berekend; SQL is daarvoor
                geen vervanging. Alleen databases zichtbaar voor het huidige
                databaseaccount tellen mee.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs leading-relaxed" role="status">
                {breakdown.detailUnavailableReason === "metadata"
                  ? "Verdeling van Weerstation en overige databases niet beschikbaar: SQL-metadata ontbreekt of is niet toegankelijk. Gebruikt en beschikbaar komen wel van Aiven."
                  : "Geen betrouwbare databaseverdeling: de SQL-schattingen zijn groter dan de gemeten gebruikte schijfruimte. Daarom toont de balk alleen het Aiven-totaal en de vrije ruimte."}
              </p>
            )}
          </div>
        ) : (
          <p role="status" className="text-muted-foreground text-xs">
            Aiven-meting of actuele opslaglimiet ontbreekt, is verouderd of kon niet
            worden geverifieerd. Er wordt geen opslagverdeling of vrije ruimte geschat;
            waarschuwingen kunnen niet worden bepaald.
          </p>
        )}

        {warning && (
          <p
            role="alert"
            className={
              warning === "critical"
                ? "text-danger text-sm font-semibold"
                : "text-warning text-sm font-semibold"
            }
          >
            {warning === "critical"
              ? "Alarm: minstens 85% gebruikt. Beoordeel of je zelf de opslag wilt uitbreiden."
              : "Waarschuwing: minstens 75% gebruikt. Beoordeel de beschikbare opslag."}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Waarschuwing bij 75% · alarm bij 85% · meldingen op deze pagina
        </p>
        <p className="text-muted-foreground text-xs">
          Geen automatische abonnementswijziging of e-mail.
        </p>
        <p role="status" className="text-sm">
          {reminder
            ? `${reminder.due ? "Herinnering: beoordeel de opslag" : "Opslag beoordelen op"} · ${reminder.date}. Je beslist zelf over uitbreiding.`
            : "Herinneringsdatum niet ingesteld; neem de eerder afgesproken datum over."}
        </p>
        {service.measuredAt && (
          <p className="text-muted-foreground text-xs">
            Laatste meting:{" "}
            {new Intl.DateTimeFormat("nl-NL", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Europe/Amsterdam",
            }).format(new Date(service.measuredAt))}
          </p>
        )}
      </section>
    </StorageRefresh>
  );
}
