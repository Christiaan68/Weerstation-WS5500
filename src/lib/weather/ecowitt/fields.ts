/**
 * Veldregistratie voor het Ecowitt-protocol (gebruikt door zowel de WS5500's
 * eigen "Customized"-upload als de Wunderground-compatibele variant, en door
 * de Ecowitt Cloud API-adapter — zie docs/ECOWITT_FIELDS.md).
 *
 * BELANGRIJK — dit bestand is bewust een expliciete, uitbreidbare registratie
 * in plaats van een "parse alles wat er is"-aanpak. Reden (zie ook de
 * opdracht voor Fase 2): we mogen nooit aannemen dat elke WS5500-firmware
 * exact dezelfde velden stuurt. Onbekende velden gaan nooit verloren (ze
 * blijven in `raw_weather_packets.raw_payload` staan) en worden apart
 * gerapporteerd (`unknownFields`) zodat de lijst hieronder na de eerste
 * echte payload gericht uitgebreid kan worden.
 *
 * Bronnen die gebruikt zijn om deze velden samen te stellen (zie ook de
 * research-samenvatting in docs/WS5500_INGESTION.md): de publieke Ecowitt-
 * protocoldocumentatie, Home Assistant's Ecowitt-integratie, en het
 * open-source `ecowitt2mqtt`-project (dat een vergelijkbare velden-registratie
 * gebruikt voor een groot aantal Ecowitt-sensoren).
 */
import type { RawFieldValue } from "../types";

/**
 * Velden die de parser herkent als METADATA (niet als meetwaarde). Ze tellen
 * mee als "herkend" (komen dus niet in `unknownFields` terecht) maar leveren
 * zelf geen observatie/sensor-rij op.
 */
export const METADATA_FIELDS = new Set([
  // Ecowitt "Customized"-protocol
  "passkey",
  "stationtype",
  "model",
  "freq",
  "dateutc",
  "runtime",
  "heap",
  "interval",
  // Legacy Wunderground-protocol
  "id",
  "password",
  "action",
  "realtime",
  "rtfreq",
  "softwaretype",
  "weather",
  "clouds",
  "visibility",
  "indoortempf", // Wunderground-variant van tempinf, zelden gebruikt door WS5500
]);

/** Converteert een ruwe waarde naar een eindige `number`, of `undefined`. */
export function toNumber(value: RawFieldValue): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export interface PlausibleRange {
  min: number;
  max: number;
}

/**
 * Plausibiliteitsgrenzen (in de brontaal/eenheid, vóór conversie) om
 * overduidelijk kapotte sensorwaarden (bekabelingsfout, kapotte sensor,
 * corrupte upload) te signaleren. Een waarde buiten dit bereik wordt NOOIT
 * stilzwijgend opgeslagen als een normale meting — hij wordt overgeslagen
 * vóór normalisatie én gemeld als waarschuwing, zodat de rest van de
 * payload gewoon verwerkt wordt (zie ook het "partial"-statuut in
 * `src/lib/db/schema.ts`).
 */
export const PLAUSIBLE_RANGES: Record<string, PlausibleRange> = {
  tempf: { min: -60, max: 160 },
  tempinf: { min: -20, max: 140 },
  humidity: { min: 0, max: 100 },
  humidityin: { min: 0, max: 100 },
  baromrelin: { min: 15, max: 35 },
  baromabsin: { min: 15, max: 35 },
  winddir: { min: -360, max: 720 },
  windspeedmph: { min: 0, max: 200 },
  windgustmph: { min: 0, max: 200 },
  maxdailygust: { min: 0, max: 200 },
  rainratein: { min: 0, max: 20 },
  eventrainin: { min: 0, max: 50 },
  hourlyrainin: { min: 0, max: 20 },
  dailyrainin: { min: 0, max: 50 },
  weeklyrainin: { min: 0, max: 100 },
  monthlyrainin: { min: 0, max: 200 },
  yearlyrainin: { min: 0, max: 400 },
  totalrainin: { min: 0, max: 4000 },
  solarradiation: { min: 0, max: 1800 },
  uv: { min: 0, max: 16 },
  dewptf: { min: -60, max: 160 },
  windchillf: { min: -80, max: 160 },
  heatindexf: { min: -60, max: 200 },
  feelslikef: { min: -80, max: 200 },
  winddir_avg10m: { min: -360, max: 720 },
  windspdmph_avg10m: { min: 0, max: 200 },
};

export function isWithinRange(field: string, value: number): boolean {
  const range = PLAUSIBLE_RANGES[field];
  if (!range) {
    return true;
  }
  return value >= range.min && value <= range.max;
}

/**
 * Aliassen: veldnamen uit de legacy Wunderground-compatibele variant die
 * hetzelfde betekenen als een al ondersteund Ecowitt-veld, maar anders heten.
 * Wordt uitsluitend gebruikt om te BESLISSEN welke regel van toepassing is
 * (plausibiliteitsbereik, observatieveld); de oorspronkelijke veldnaam blijft
 * gebruikt in `recognizedFields`/waarschuwingen.
 */
export const ALIAS_FIELDS: Record<string, string> = {
  rainin: "hourlyrainin",
  baromin: "baromabsin",
};

/** Directe (niet-kanaal-gebonden) hoofdmeetvelden en het observatieveld waarop ze afbeelden. */
export const DIRECT_OBSERVATION_FIELDS = [
  "tempinf",
  "humidityin",
  "baromrelin",
  "baromabsin",
  "tempf",
  "humidity",
  "winddir",
  "windspeedmph",
  "windgustmph",
  "maxdailygust",
  "rainratein",
  "eventrainin",
  "hourlyrainin",
  "dailyrainin",
  "weeklyrainin",
  "monthlyrainin",
  "yearlyrainin",
  "totalrainin",
  "solarradiation",
  "uv",
  // Door sommige Ecowitt-gateways zelf berekende, optionele extra's.
  "dewptf",
  "windchillf",
  "heatindexf",
  "feelslikef",
] as const;

/**
 * Velden die WEL een directe (niet-kanaalgebonden) meting zijn, maar niet in
 * een vaste `weather_observations`-kolom passen — deze belanden in
 * `sensor_measurements` via de generieke sensor-route.
 */
export const EXTRA_SENSOR_DIRECT_FIELDS: Record<
  string,
  {
    sensorType: string;
    metric: string;
    unit: string;
    kind: "speed_mph" | "direction_deg";
  }
> = {
  maxdailygust: {
    sensorType: "wind",
    metric: "max_daily_gust_kmh",
    unit: "km/h",
    kind: "speed_mph",
  },
  winddir_avg10m: {
    sensorType: "wind",
    metric: "avg_10m_direction_deg",
    unit: "°",
    kind: "direction_deg",
  },
  windspdmph_avg10m: {
    sensorType: "wind",
    metric: "avg_10m_speed_kmh",
    unit: "km/h",
    kind: "speed_mph",
  },
};

/**
 * Batterijvelden die een simpel "ok/laag"-signaal zijn (0 = ok, 1 = laag).
 * Dit is de meest gangbare conventie voor Ecowitt-sensorbatterijen; sommige
 * sensortypes rapporteren in plaats daarvan een spanning (zie
 * `VOLTAGE_BATTERY_FIELDS`) — welke van de twee een specifieke WS5500-add-on
 * daadwerkelijk stuurt, staat pas vast na een eerste echte payload (zie
 * docs/ECOWITT_FIELDS.md).
 */
export const BOOLEAN_BATTERY_FIELDS: Record<string, string> = {
  wh65batt: "outdoor_array",
  wh25batt: "indoor_console",
  wh26batt: "outdoor_th",
  wh57batt: "lightning",
  co2_batt: "co2",
};

/** Kanaalgebonden veldpatronen (extra temp/vocht, bodemvocht, PM2.5, lek, batterijen). */
export interface ChannelFieldPattern {
  pattern: RegExp;
  sensorType: string;
  metric: string;
  unit?: string;
  /** `true` als de ruwe waarde een booleaans batterijsignaal is (0=ok,1=laag). */
  isBooleanBattery?: boolean;
  /** Fahrenheit → Celsius conversie nodig? */
  isFahrenheit?: boolean;
}

export const CHANNEL_FIELD_PATTERNS: ChannelFieldPattern[] = [
  // WH31/WH32: extra temperatuur/vochtkanalen 1–8
  {
    pattern: /^temp(\d)f$/,
    sensorType: "extra_temperature",
    metric: "temperature_c",
    unit: "°C",
    isFahrenheit: true,
  },
  {
    pattern: /^humidity(\d)$/,
    sensorType: "extra_humidity",
    metric: "humidity_pct",
    unit: "%",
  },
  {
    pattern: /^batt(\d)$/,
    sensorType: "extra_temperature",
    metric: "battery_state",
    isBooleanBattery: true,
  },
  // WH51: bodemvocht kanalen 1–8
  {
    pattern: /^soilmoisture(\d)$/,
    sensorType: "soil_moisture",
    metric: "moisture_pct",
    unit: "%",
  },
  {
    pattern: /^soilbatt(\d)$/,
    sensorType: "soil_moisture",
    metric: "battery_voltage",
    unit: "V",
  },
  // WH34/WH35: extra temperatuur (kabelsensor) / bladvocht kanalen 1–8
  {
    pattern: /^tf_ch(\d)$/,
    sensorType: "extra_temperature_probe",
    metric: "temperature_c",
    unit: "°C",
    isFahrenheit: true,
  },
  {
    pattern: /^tf_batt(\d)$/,
    sensorType: "extra_temperature_probe",
    metric: "battery_voltage",
    unit: "V",
  },
  {
    pattern: /^leafwetness_ch(\d)$/,
    sensorType: "leaf_wetness",
    metric: "wetness_pct",
    unit: "%",
  },
  {
    pattern: /^leaf_batt(\d)$/,
    sensorType: "leaf_wetness",
    metric: "battery_voltage",
    unit: "V",
  },
  // WH55: waterlekkage kanalen 1–4
  {
    pattern: /^leak_ch(\d)$/,
    sensorType: "water_leak",
    metric: "leak_detected",
    isBooleanBattery: false,
  },
  {
    pattern: /^leakbatt(\d)$/,
    sensorType: "water_leak",
    metric: "battery_state",
    isBooleanBattery: true,
  },
  // WH41/WH43: PM2.5 kanalen 1–4
  {
    pattern: /^pm25_ch(\d)$/,
    sensorType: "pm25",
    metric: "concentration_ugm3",
    unit: "µg/m³",
  },
  {
    pattern: /^pm25_avg_24h_ch(\d)$/,
    sensorType: "pm25",
    metric: "concentration_24h_avg_ugm3",
    unit: "µg/m³",
  },
  {
    pattern: /^pm25batt(\d)$/,
    sensorType: "pm25",
    metric: "battery_state",
    isBooleanBattery: true,
  },
];

/** Ongebonden (geen kanaalnummer) sensorvelden buiten de hoofdmeting (CO₂, bliksem). */
export const MISC_SENSOR_FIELDS: Record<
  string,
  {
    sensorType: string;
    metric: string;
    unit?: string;
    /**
     * `true` als de ruwe waarde Unix-epoch-seconden zijn die als leesbare
     * ISO-8601-tekst opgeslagen moeten worden (`valueText`) in plaats van als
     * `valueNumeric`. Nodig omdat `sensor_measurements.value_numeric` een
     * `decimal(12,4)` is — een epoch-tijdstip (10+ cijfers vóór de komma)
     * past daar niet in en veroorzaakt een databasefout ("Out of range
     * value"). Ontdekt tijdens de live-smoketest met `lightning_time`, zie
     * `docs/WS5500_INGESTION.md` §Onzekerheden.
     */
    epochSecondsAsIsoText?: boolean;
  }
> = {
  co2: { sensorType: "co2", metric: "concentration_ppm", unit: "ppm" },
  co2_24h: { sensorType: "co2", metric: "concentration_24h_avg_ppm", unit: "ppm" },
  lightning_num: { sensorType: "lightning", metric: "strike_count" },
  lightning: { sensorType: "lightning", metric: "distance_km", unit: "km" },
  lightning_time: {
    sensorType: "lightning",
    metric: "last_strike_at",
    epochSecondsAsIsoText: true,
  },
};
