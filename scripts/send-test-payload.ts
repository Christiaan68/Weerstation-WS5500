/**
 * Stuurt een testpayload naar het ingestie-endpoint — handig om de hele
 * keten (route → parser → database) te controleren zonder op een echte
 * WS5500-upload te wachten.
 *
 * Gebruik:
 *   npm run weather:test-payload -- --fixture=full-payload
 *   npm run weather:test-payload -- --fixture=wunderground-get-payload --method=GET
 *   npm run weather:test-payload -- --url=https://mijn-site.vercel.app --secret=... --passkey=ABC123
 *
 * Zonder `--passkey` wordt automatisch de identifier van het (enige) actieve
 * station in de database gebruikt, zodat de aanvraag ook echt matcht — zie
 * `docs/WS5500_SETUP.md`.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";

import { getStation } from "../src/lib/db/queries";

interface Args {
  url: string;
  secret?: string;
  fixture: string;
  passkey?: string;
  method: "GET" | "POST";
}

function parseArgs(): Args {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      args[match[1]] = match[2];
    }
  }

  return {
    url: args.url ?? process.env.WEATHER_INGEST_BASE_URL ?? "http://localhost:3000",
    secret: args.secret ?? process.env.WEATHER_INGEST_SECRET,
    fixture: args.fixture ?? "full-payload",
    passkey: args.passkey,
    method: args.method?.toUpperCase() === "GET" ? "GET" : "POST",
  };
}

function loadFixture(name: string): Record<string, unknown> {
  const withExtension = name.endsWith(".json") ? name : `${name}.json`;
  const fixturePath = path.isAbsolute(withExtension)
    ? withExtension
    : path.resolve(__dirname, "../tests/fixtures/ecowitt", withExtension);

  if (!fs.existsSync(fixturePath)) {
    const available = fs
      .readdirSync(path.resolve(__dirname, "../tests/fixtures/ecowitt"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""));
    throw new Error(
      `Fixture '${name}' niet gevonden op ${fixturePath}.\nBeschikbaar: ${available.join(", ")}`,
    );
  }

  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

async function main() {
  const args = parseArgs();

  if (!args.secret) {
    throw new Error(
      "Geen secret opgegeven. Zet WEATHER_INGEST_SECRET in .env.local of geef --secret=... mee.",
    );
  }

  const payload = loadFixture(args.fixture);

  let passkey = args.passkey;
  if (!passkey) {
    const station = await getStation().catch(() => undefined);
    passkey = station?.stationIdentifier;
    if (passkey) {
      console.log(
        `Geen --passkey opgegeven; identifier van station '${station?.displayName}' gebruikt.`,
      );
    }
  }
  if (passkey) {
    if ("PASSKEY" in payload) payload.PASSKEY = passkey;
    if ("ID" in payload) payload.ID = passkey;
  } else {
    console.warn(
      "Waarschuwing: geen passkey bekend (geen station in de database en geen --passkey meegegeven). " +
        "De payload wordt verstuurd zoals hij in de fixture staat.",
    );
  }

  const targetUrl = new URL(`/api/weather/ingest/${args.secret}`, args.url);
  const fields = Object.entries(payload).map(
    ([key, value]) => [key, String(value)] as const,
  );

  let response: Response;
  if (args.method === "GET") {
    for (const [key, value] of fields) {
      targetUrl.searchParams.set(key, value);
    }
    console.log(`GET ${targetUrl.toString().replace(args.secret, "***")}`);
    response = await fetch(targetUrl.toString());
  } else {
    const body = new URLSearchParams();
    for (const [key, value] of fields) {
      body.set(key, value);
    }
    console.log(`POST ${targetUrl.toString().replace(args.secret, "***")}`);
    console.log(`Body: ${body.toString()}`);
    response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  const text = await response.text();
  console.log(`\nStatus: ${response.status}`);
  console.log(`Body: ${text}`);
  console.log(
    "\nControleer het resultaat in detail op /station/diagnostics (met STATION_DIAGNOSTICS_SECRET).",
  );

  process.exit(response.ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
