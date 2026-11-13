import {
  getServiceStorage,
  getSqlDistribution,
  storageWarning,
} from "@/lib/db/service-storage";
import { formatStorageBytes, formatStoragePercent } from "@/lib/weather/storage-format";

const mb = (bytes: number) =>
  `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bytes / 1e6)} MB`;
export async function ServiceStorageSummary() {
  const [service, sql] = await Promise.all([getServiceStorage(), getSqlDistribution()]);
  const warning = storageWarning(service.percent);
  // SQL estimates cannot be reconciled with a percentage whose disk capacity
  // at measurement time is unknown (for example during a plan change).
  const segments =
    sql.status === "ok"
      ? [
          { bytes: sql.weatherBytes, color: "#38bdf8", label: "Weerstation" },
          ...sql.others.map((item) => ({ ...item, label: "Overige databases" })),
        ]
      : [];
  const denominator = sql.status === "ok" ? sql.totalBytes : 0;
  return (
    <section className="space-y-3" aria-label="Servicebrede opslag">
      <h3 className="text-sm font-semibold">Aiven · volledige MySQL-service</h3>
      <p className="text-2xl font-semibold tabular-nums">
        {service.percent === null
          ? "Schijfgebruik onbekend"
          : `${formatStoragePercent(service.percent)} gebruikt`}
      </p>
      <p className="text-sm">
        Verbruik in MB onbekend ·{" "}
        {service.limitBytes === null
          ? "Actuele dienstlimiet onbekend; planmetadata niet beschikbaar."
          : `Dienstlimiet ${formatStorageBytes(service.limitBytes, 2)} (${mb(service.limitBytes)})`}
      </p>
      <p className="text-muted-foreground text-xs">
        De actuele planlimiet bewijst niet welke schijfcapaciteit gold op het meetmoment.
        Daarom rekenen we het percentage niet om naar MB.
      </p>
      {service.percent !== null && (
        <div
          role="progressbar"
          aria-label="Werkelijk Aiven-schijfgebruik"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={service.percent}
          className="bg-muted h-2 overflow-hidden rounded-full"
        >
          <div className="h-full bg-slate-400" style={{ width: `${service.percent}%` }} />
        </div>
      )}
      {service.percent === null && (
        <p role="status" className="text-muted-foreground text-xs">
          Geen actuele Aiven-schijfmeting beschikbaar. SQL-tabelgroottes worden niet
          gebruikt als vervanging; capaciteitswaarschuwingen zijn onbekend.
        </p>
      )}
      {warning && (
        <p
          role="status"
          className={
            warning === "critical" ? "text-danger text-sm" : "text-warning text-sm"
          }
        >
          {warning === "critical"
            ? "Dringend: minimaal 85% van de schijf gebruikt. Plan uitbreiding op korte termijn."
            : "Let op: minimaal 70% van de schijf gebruikt. Houd de groei in de gaten en plan uitbreiding."}
        </p>
      )}
      {service.measuredAt && (
        <p className="text-muted-foreground text-xs">
          Meting:{" "}
          {new Intl.DateTimeFormat("nl-NL", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Europe/Amsterdam",
          }).format(new Date(service.measuredAt))}
          . Bij meerdere gerapporteerde nodes geldt de hoogste benutting.
        </p>
      )}
      <p className="text-sm">Fysieke schijfgroei: geen 30-dagenprognose beschikbaar</p>
      <p className="text-muted-foreground text-xs">
        De app bewaart hiervoor nog geen historische schijfmetingen met bijbehorende
        capaciteit. De ruwe recordgroeischatting op de stationpagina is een andere
        berekening en voorspelt geen vrije Aiven-schijfruimte.
      </p>
      <h4 className="text-sm font-medium">Indicatieve SQL-verdeling</h4>
      {sql.status !== "ok" ? (
        <p className="text-muted-foreground text-xs">
          SQL-opslagverdeling niet beschikbaar.
        </p>
      ) : (
        <>
          {denominator > 0 && (
            <div
              className="bg-muted flex h-3 overflow-hidden rounded-full"
              role="img"
              aria-label="Indicatieve verdeling: Weerstation, Overige databases "
            >
              {segments.map((segment, index) => (
                <span
                  key={index}
                  title={`${segment.label}: ${mb(segment.bytes)}`}
                  style={{
                    width: `${(segment.bytes / denominator) * 100}%`,
                    backgroundColor: segment.color,
                  }}
                />
              ))}
            </div>
          )}
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <li>
              <span
                aria-hidden="true"
                className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400"
              />
              Weerstation: {mb(sql.weatherBytes)}
            </li>
            <li>Overige databases: {mb(sql.otherBytes)}</li>
          </ul>
          <p className="text-muted-foreground text-xs">
            SQL-totaal: {mb(sql.totalBytes)}. Alle niet-systeemdatabases die zichtbaar
            zijn voor de bestaande databaseverbinding, inclusief toekomstige databases.
            Beperkte leesrechten kunnen de verdeling onvolledig maken.
          </p>
          <p className="text-muted-foreground text-xs">
            Data en indexen zijn schattingen; logs, systeemruimte en andere overhead
            vallen erbuiten. Deze kleurenbalk toont uitsluitend de onderlinge
            SQL-verdeling, niet de schijfbezetting of vrije ruimte.
          </p>
        </>
      )}
    </section>
  );
}
