import { Database } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDatabaseStorage } from "@/lib/db/storage";
import { formatStorageBytes } from "@/lib/weather/storage-format";

const COLORS = [
  "bg-sky-400",
  "bg-cyan-400",
  "bg-teal-400",
  "bg-emerald-400",
  "bg-indigo-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-orange-400",
  "bg-rose-400",
];

export async function DatabaseStorageCard() {
  const storage = await getDatabaseStorage();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" aria-hidden="true" /> Database-opslag
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {storage.status !== "ok" ? (
          <p className="text-muted-foreground text-sm" role="status">
            {storage.status === "error"
              ? "De opslaggrootte kan nu niet worden opgehaald. Vernieuw de pagina om opnieuw te proberen."
              : "Nog geen opslagmetadata beschikbaar voor de weerstationtabellen."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-foreground text-2xl font-semibold tabular-nums">
                {formatStorageBytes(storage.totalBytes)}
              </p>
              <span className="text-muted-foreground text-xs">
                {storage.missingTables.length
                  ? "Subtotaal beschikbare tabellen"
                  : "Totaal · alle stations"}
              </span>
            </div>
            <div
              className="bg-muted flex h-3 overflow-hidden rounded-full"
              role="img"
              aria-label={`Verdeling database-opslag: ${formatStorageBytes(storage.totalBytes)}`}
            >
              {storage.components.map((component, index) => (
                <span
                  key={component.table}
                  className={COLORS[index % COLORS.length]}
                  style={{
                    width: `${storage.totalBytes > 0 ? (component.bytes / storage.totalBytes) * 100 : 0}%`,
                  }}
                />
              ))}
            </div>
            {storage.totalBytes === 0 && (
              <p className="text-muted-foreground text-sm">
                MySQL rapporteert momenteel 0 B tabelruimte.
              </p>
            )}
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {storage.components.map((component, index) => (
                <li
                  key={component.table}
                  className="flex min-w-0 items-center gap-2 text-xs"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${COLORS[index % COLORS.length]}`}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground min-w-0 break-all">
                    {component.table}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {formatStorageBytes(component.bytes)}
                  </span>
                </li>
              ))}
            </ul>
            {storage.missingTables.length > 0 && (
              <p className="text-warning text-xs" role="status">
                Geen metadata voor: {storage.missingTables.join(", ")}. Deze tabellen
                tellen niet mee.
              </p>
            )}
            <p className="text-muted-foreground text-xs leading-relaxed">
              Actieve MySQL-database · data inclusief indexen. MySQL-opslagstatistieken
              zijn bij benadering en kunnen achterlopen. Exclusief vrije schijfruimte,
              serverlogs en back-ups. De balk toont de verdeling over tabellen. Er is geen
              bevestigde Aiven-planlimiet beschikbaar.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
