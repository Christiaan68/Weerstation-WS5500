import { NextResponse } from "next/server";

import { getDatabaseHealth } from "@/lib/db/queries";

/**
 * Nooit statisch prerenderen of cachen: elke aanroep moet de actuele
 * databasestatus tonen, en deze route mag ook nooit tijdens `next build`
 * uitgevoerd worden (dan zou een build zonder geldige DATABASE_URL kunnen
 * falen op een netwerkaanroep naar TiDB).
 */
export const dynamic = "force-dynamic";

interface HealthResponseBody {
  status: "ok" | "degraded";
  app: "ok";
  database: "ok" | "error";
  timestamp: string;
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const databaseHealth = await getDatabaseHealth();

  const body: HealthResponseBody = {
    status: databaseHealth.status === "ok" ? "ok" : "degraded",
    app: "ok",
    database: databaseHealth.status === "ok" ? "ok" : "error",
    timestamp,
  };

  // Geen databasedetails (host, foutmelding, stack trace) in de response —
  // die kunnen intern gelogd worden, maar horen niet in een publiek
  // endpoint. Zie punt 31/32 van de projectinstructies.
  if (databaseHealth.status === "error") {
    console.error("[health] databaseverbinding mislukt:", databaseHealth.error);
  }

  return NextResponse.json(body, {
    status: body.status === "ok" ? 200 : 503,
  });
}
