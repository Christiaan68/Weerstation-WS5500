/**
 * Tijdelijk hulpscript — NIET onderdeel van de normale werkwijze.
 *
 * Achtergrond: migratie 0001 is handmatig toegepast via
 * scripts/diagnose-migration.mjs, buiten drizzle-kit om. Daardoor weet
 * drizzle-kit's eigen boekhoudtabel (`__drizzle_migrations`) niet dat deze
 * migratie al is toegepast. Zonder deze reparatie zou een toekomstige
 * `npm run db:migrate` (bv. in Fase 3) migratie 0001 opnieuw proberen uit te
 * voeren en mislukken met "already exists"/"duplicate column"-fouten, omdat
 * die wijzigingen er al staan.
 *
 * Dit script leest, voor elke migratie in db/migrations/meta/_journal.json,
 * het bijbehorende .sql-bestand van schijf, berekent exact dezelfde
 * sha256-hash die drizzle-kit zelf zou berekenen, en zet — ALLEEN als die
 * hash nog niet in `__drizzle_migrations` staat — een rij neer die
 * overeenkomt met "deze migratie is al toegepast". Migraties die al bekend
 * zijn (zoals 0000 uit Fase 1) worden overgeslagen, dus dit script is
 * veilig om te draaien.
 *
 * Gebruik:
 *   node scripts/mark-migration-applied.mjs
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../db/migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta/_journal.json");

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("FOUT: DATABASE_URL staat niet in .env.local. Stop.");
    process.exit(1);
  }

  if (!fs.existsSync(JOURNAL_PATH)) {
    console.error(
      `FOUT: ${JOURNAL_PATH} bestaat niet. Heb je alle bestanden uit de zip uitgepakt, ` +
        "inclusief db/migrations/meta/_journal.json?",
    );
    process.exit(1);
  }

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
  console.log(`${journal.entries.length} migratie(s) gevonden in de journal.\n`);

  const conn = parseDatabaseUrl(databaseUrl);
  const connection = await mysql.createConnection({
    ...conn,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  await connection.query(
    "create table if not exists `__drizzle_migrations` (" +
      "`id` serial primary key, `hash` text not null, `created_at` bigint)",
  );

  const [existingRows] = await connection.query(
    "select `hash` from `__drizzle_migrations`",
  );
  const existingHashes = new Set(existingRows.map((row) => row.hash));

  for (const entry of journal.entries) {
    const sqlPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) {
      console.log(`⚠️  ${entry.tag}: bestand ${sqlPath} niet gevonden, overgeslagen.`);
      continue;
    }
    const sqlContent = fs.readFileSync(sqlPath, "utf8");
    const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

    if (existingHashes.has(hash)) {
      console.log(`✅ ${entry.tag}: al bekend bij drizzle-kit, niets te doen.`);
      continue;
    }

    await connection.query(
      "insert into `__drizzle_migrations` (`hash`, `created_at`) values (?, ?)",
      [hash, entry.when],
    );
    console.log(
      `➕ ${entry.tag}: als toegepast gemarkeerd (hash ${hash.slice(0, 12)}...).`,
    );
  }

  await connection.end();
  console.log(
    "\nKlaar. `npm run db:migrate` zal deze migratie(s) nu niet meer opnieuw proberen.",
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Onverwachte fout:");
  console.error(error);
  process.exit(1);
});
