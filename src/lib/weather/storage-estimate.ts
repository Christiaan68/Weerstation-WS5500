/**
 * Databasegroei-schatting (Fase 4, `/station` §Dataopslag) — pure
 * rekenlogica, geen databasetoegang (zie `src/lib/db/queries.ts`
 * `getStorageStats()` voor de daadwerkelijke tellingen).
 *
 * BEWUST EEN SCHATTING, GEEN EXACTE PROGNOSE: TiDB's daadwerkelijke
 * opslaggebruik per rij hangt af van compressie, indexen, MVCC-versies en
 * fragmentatie — dingen die we vanuit de applicatie niet kennen. In plaats
 * daarvan projecteren we het AANTAL RIJEN (betrouwbaar, uit het huidige
 * meetritme af te leiden) en vermenigvuldigen dat met een grove, in
 * commentaar onderbouwde byte-per-rij-aanname per tabel. Elke aanroeper
 * MOET dit resultaat als schatting labelen (zie `StorageGrowthEstimate`
 * hieronder — `isRough: true` op elk niveau, geen suggestie van precisie).
 */

export interface StorageEstimateInput {
  /** Huidige rijtelling per tabel — zie `getStorageStats()`. */
  observationCount: number;
  rawPacketCount: number;
  sensorMeasurementCount: number;
  /** Dagen sinds de eerste meting (>= 1) — de basis voor het huidige meetritme. */
  daysSinceFirstObservation: number;
  /** Huidig pollinterval in seconden — fallback als er nog te weinig historie is om een ritme uit af te leiden. */
  pollIntervalSeconds: number;
}

export interface TableGrowthEstimate {
  table: string;
  /** Grove aanname voor de opslagruimte per rij, in bytes — zie de per-tabel toelichting in `TABLE_BYTES_PER_ROW_ESTIMATE`. */
  estimatedBytesPerRow: number;
  projectedRows: { oneYear: number; fiveYears: number; tenYears: number };
  projectedMb: { oneYear: number; fiveYears: number; tenYears: number };
}

export interface StorageGrowthEstimate {
  /** Metingen (en dus ook ruwe pakketten) per dag, afgeleid van de echte historie — of de theoretische pollfrequentie als fallback. */
  observationsPerDay: number;
  usedFallbackRate: boolean;
  tables: TableGrowthEstimate[];
  totalProjectedMb: { oneYear: number; fiveYears: number; tenYears: number };
  /** Altijd `true` — dwingt aanroepers dit nooit als exacte waarde te presenteren. */
  isRough: true;
}

/**
 * Grove byte-per-rij-aannames, per tabel onderbouwd vanuit het schema
 * (`src/lib/db/schema.ts`). Ruim naar boven afgerond (liever een te hoge dan
 * een te optimistische schatting):
 * - `weather_observations`: ~24 decimal/numerieke kolommen + 2 timestamps +
 *   een JSON-kolom (meestal leeg) + rij-/index-overhead.
 * - `raw_weather_packets`: bevat de VOLLEDIGE ruwe payload (JSON) plus de
 *   ruwe requestbody-tekst — veruit de grootste tabel per rij.
 * - `sensor_measurements`: smal (één meetwaarde per rij), maar potentieel
 *   veel rijen zodra er extra sensorkanalen bijkomen (zie §23).
 * - dag/maand/jaar-samenvattingen: zelfde kolombreedte als observations,
 *   maar met een verwaarloosbaar aantal rijen (1/dag, 1/maand, 1/jaar).
 */
const TABLE_BYTES_PER_ROW_ESTIMATE = {
  weather_observations: 300,
  raw_weather_packets: 2200,
  sensor_measurements: 150,
  daily_weather_summary: 300,
  monthly_weather_summary: 300,
  yearly_weather_summary: 300,
} as const;

const DAYS_PER_YEAR = 365;

function projectRows(perDay: number, days: number): number {
  return Math.round(perDay * days);
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function estimateTable(
  table: keyof typeof TABLE_BYTES_PER_ROW_ESTIMATE,
  currentRows: number,
  rowsPerDay: number,
): TableGrowthEstimate {
  const bytesPerRow = TABLE_BYTES_PER_ROW_ESTIMATE[table];
  const oneYearRows = currentRows + projectRows(rowsPerDay, DAYS_PER_YEAR);
  const fiveYearRows = currentRows + projectRows(rowsPerDay, DAYS_PER_YEAR * 5);
  const tenYearRows = currentRows + projectRows(rowsPerDay, DAYS_PER_YEAR * 10);

  return {
    table,
    estimatedBytesPerRow: bytesPerRow,
    projectedRows: { oneYear: oneYearRows, fiveYears: fiveYearRows, tenYears: tenYearRows },
    projectedMb: {
      oneYear: bytesToMb(oneYearRows * bytesPerRow),
      fiveYears: bytesToMb(fiveYearRows * bytesPerRow),
      tenYears: bytesToMb(tenYearRows * bytesPerRow),
    },
  };
}

/**
 * Bouwt de volledige groeischatting. Metingen/dag wordt bij voorkeur
 * afgeleid van de ECHTE historie (`observationCount / daysSinceFirstObservation`)
 * — pas bij minder dan 2 dagen historie (te ruisgevoelig, bv. vlak na
 * installatie) valt dit terug op de theoretische pollfrequentie
 * (`86400 / pollIntervalSeconds`), gemarkeerd via `usedFallbackRate`.
 * Dag/maand/jaar-samenvattingen groeien te verwaarloosbaar traag (1 rij per
 * dag/maand/jaar) om apart te projecteren — die tellen mee in het totaal via
 * hun HUIDIGE rijtelling, niet via een eigen groeisnelheid.
 */
export function estimateStorageGrowth(input: StorageEstimateInput): StorageGrowthEstimate {
  const usedFallbackRate = input.daysSinceFirstObservation < 2;
  const observationsPerDay = usedFallbackRate
    ? 86400 / input.pollIntervalSeconds
    : input.observationCount / input.daysSinceFirstObservation;

  const tables = [
    estimateTable("weather_observations", input.observationCount, observationsPerDay),
    // Ruwe pakketten groeien in de praktijk ongeveer 1:1 met metingen (elke
    // succesvolle poll levert zowel een pakket als een meting op; mislukte/
    // dubbele polls leveren wél een pakket maar geen meting op — per saldo
    // dus een lichte onderschatting, bewust aan de veilige kant).
    estimateTable("raw_weather_packets", input.rawPacketCount, observationsPerDay),
    // sensor_measurements: schaalt mee met de HUIDIGE verhouding t.o.v.
    // observaties (0 zolang er geen extra sensorkanalen zijn aangesloten —
    // zie §23), niet met een aparte aanname.
    estimateTable(
      "sensor_measurements",
      input.sensorMeasurementCount,
      input.observationCount > 0
        ? (input.sensorMeasurementCount / input.observationCount) * observationsPerDay
        : 0,
    ),
  ];

  const totalProjectedMb = {
    oneYear: Math.round(tables.reduce((sum, t) => sum + t.projectedMb.oneYear, 0) * 10) / 10,
    fiveYears:
      Math.round(tables.reduce((sum, t) => sum + t.projectedMb.fiveYears, 0) * 10) / 10,
    tenYears:
      Math.round(tables.reduce((sum, t) => sum + t.projectedMb.tenYears, 0) * 10) / 10,
  };

  return {
    observationsPerDay: Math.round(observationsPerDay * 10) / 10,
    usedFallbackRate,
    tables,
    totalProjectedMb,
    isRough: true,
  };
}
