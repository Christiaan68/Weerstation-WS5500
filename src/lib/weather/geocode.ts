/**
 * Geocoding voor de "Locatie"-invoer bij stationbeheer: zet een door de
 * gebruiker getypte plaatsnaam, postcode, volledig adres (straat +
 * huisnummer + plaats) of coördinatenpaar om naar breedtegraad/lengtegraad
 * plus een leesbare naam, voor gebruik in de 5-daagse verwachting
 * (`forecast.ts`) en het stationoverzicht (`/station`).
 *
 * - Coördinaten (bv. "52.3676, 4.9041") worden rechtstreeks herkend, zonder
 *   netwerk.
 * - Al het andere (plaatsnaam, postcode, adres) wordt in Nederland gezocht
 *   bij Nominatim (OpenStreetMap) — gratis, geen sleutel nodig. Open-Meteo heeft ook een
 *   eigen, gratis geocoding-API, maar die doorzoekt alleen plaatsnamen en
 *   kent GEEN postcodes of adressen (geverifieerd: "1011 AB" levert daar nul
 *   resultaten op) — Nominatim kent die wel.
 *   Zie https://nominatim.org/release-docs/latest/api/Search/ en het
 *   gebruiksbeleid https://operations.osmfoundation.org/policies/nominatim/:
 *   max. 1 aanvraag/seconde (hier ruimschoots onder — dit draait alleen bij
 *   het opslaan van een station in het beheerscherm; bij een tweede poging
 *   zonder huisnummer wordt expliciet ruim 1 seconde gewacht) en een
 *   identificerende `User-Agent` — bewust ZONDER e-mailadres van de
 *   gebruiker/eigenaar hierin, alleen de projectnaam en -URL.
 * - Een volledig adres ("Dam 1, Amsterdam" of "Domplein 1 Utrecht") wordt
 *   als vrije tekst doorgegeven en levert een resultaat op huisnummerniveau
 *   (geverifieerd tegen Nominatim). De opgeslagen naam bevat dan straat,
 *   huisnummer en plaats, zodat het bewerkformulier dit exacte adres weer
 *   toont en opnieuw opslaan niet naar de plaats-middelpunt verspringt.
 *   Kent OpenStreetMap het huisnummer niet, dan volgt een tweede poging
 *   zonder huisnummer (straatniveau).
 *
 * Bewust alleen pure functies + `fetch`-aanroepen, net als forecast.ts,
 * zodat het grootste deel zonder netwerk getest kan worden (zie
 * tests/weather-geocode.test.ts).
 */

const NOMINATIM_USER_AGENT = "Weerstation-WS5500 (https://mijnweerstation.nl)";

/** Nominatim vraagt max. 1 aanvraag/seconde; tussen twee pogingen wachten we iets langer. */
const RETRY_DELAY_MS = 1100;

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  /**
   * Leesbare naam: bij een adres "Straat 12, Plaats", bij een postcode
   * "1011 AB, Plaats", bij een plaats "Plaats", bij coördinaten "lat, lon".
   */
  name: string;
}

/**
 * Herkent "lat, lon" (ook met puntkomma of alleen spatie als scheiding,
 * decimale punt). Retourneert `null` als de tekst geen geldig
 * coördinatenpaar is (dan behandelt `resolveStationLocation()` de invoer
 * als plaatsnaam/postcode/adres).
 */
const COORDINATE_PATTERN = /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/;

export function parseCoordinates(
  input: string,
): { latitude: number; longitude: number } | null {
  const match = input.trim().match(COORDINATE_PATTERN);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/** Leesbare weergave van coördinaten, bv. "52.3676, 4.9041". */
export function formatCoordinateName(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export function buildGeocodeUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
    // Alleen Nederland: zonder dit filter vindt Nominatim voor een Nederlandse
    // postcode als "1011 AB" een willekeurig adres elders (geverifieerd: een
    // apotheek in Calgary, Canada) en zou een verwachting stilzwijgend voor
    // de verkeerde plek gemaakt worden. Dit project is Nederlands (De Bilt
    // als standaardlocatie, tijdzone Europe/Amsterdam). Een station buiten
    // Nederland: voer coördinaten in, die worden nooit opgezocht
    // (`parseCoordinates()`) en werken dus overal.
    countrycodes: "nl",
    "accept-language": "nl",
  });
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  path?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  country?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  address?: NominatimAddress;
  display_name?: string;
}

/**
 * Bouwt de leesbare naam uit het Nominatim-adres: "Straat 12, Plaats" als er
 * een straat is, "1011 AB, Plaats" voor een postcoderesultaat, anders alleen
 * "Plaats". Het land wordt bewust weggelaten (altijd Nederland).
 */
function buildLocationName(address: NominatimAddress): string | null {
  const place =
    address.city || address.town || address.village || address.hamlet || address.municipality;
  const street = address.road || address.pedestrian || address.footway || address.path;
  const streetLine = street
    ? address.house_number
      ? `${street} ${address.house_number}`
      : street
    : undefined;

  const parts = streetLine
    ? [streetLine, place]
    : address.postcode
      ? [address.postcode, place]
      : [place];
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(", ") : null;
}

/**
 * Zet de ruwe Nominatim-respons om naar een resultaat. Geeft `null` bij geen
 * (geldig) resultaat — nooit een exception, zodat de aanroeper altijd een
 * duidelijke "niet gevonden"-melding kan tonen i.p.v. een rauwe fout.
 */
export function parseGeocodeResponse(json: unknown): ResolvedLocation | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as NominatimResult;
  const latitude = Number(first?.lat);
  const longitude = Number(first?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const name =
    buildLocationName(first.address ?? {}) ||
    first.display_name ||
    formatCoordinateName(latitude, longitude);

  return { latitude, longitude, name };
}

/**
 * Haalt een eventueel huisnummer (met toevoeging, bv. "12", "12a", "12 a",
 * "12-14") uit een adres, voor een tweede zoekpoging op straatniveau.
 * Retourneert `null` als er geen huisnummer in staat. Een postcode ("1011
 * AB") en een getal aan het begin (straatnamen als "2e Weteringdwarsstraat")
 * worden nooit als huisnummer gezien.
 */
export function stripHouseNumber(query: string): string | null {
  const tokens = query.split(/[\s,]+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/^\d{1,5}[a-zA-Z]?(?:[-/]\d{1,4}[a-zA-Z]?)?$/.test(token)) continue;
    const next = tokens[i + 1];
    if (/^\d{4}$/.test(token) && next && /^[a-zA-Z]{2}$/.test(next)) continue; // postcode
    let end = i + 1;
    if (next && /^[a-zA-Z]$/.test(next)) end++; // losse toevoeging: "12 a"
    const rest = [...tokens.slice(0, i), ...tokens.slice(end)].join(" ");
    return rest || null;
  }
  return null;
}

/**
 * Korte plaatsaanduiding voor bij de 5-daagse verwachting op het dashboard:
 * alleen de plaats uit een opgeslagen locatienaam ("Dam 1, Amsterdam" →
 * "Amsterdam"), zodat het huisadres niet op het dashboard verschijnt.
 * Retourneert `null` als er geen plaats uit te halen is (leeg of alleen
 * coördinaten) — de aanroeper kiest dan een eigen tekst.
 */
export function forecastPlaceLabel(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (COORDINATE_PATTERN.test(trimmed)) return null;
  const segments = trimmed
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/^(nederland|netherlands)$/i.test(segment));
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

/**
 * Eén zoekaanvraag. `undefined` = netwerk-/HTTP-fout (niet opnieuw proberen),
 * `null` = geen resultaat, anders het resultaat.
 */
async function searchNominatim(query: string): Promise<ResolvedLocation | null | undefined> {
  try {
    const response = await fetch(buildGeocodeUrl(query), {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    return parseGeocodeResponse(await response.json());
  } catch {
    return undefined;
  }
}

/**
 * Lost de "Locatie"-invoer van het stationformulier op naar coördinaten +
 * leesbare naam. Herkent eerst coördinaten (geen netwerk nodig); anders een
 * geocoding-aanvraag naar Nominatim (plaatsnaam, postcode of volledig adres).
 * Vindt Nominatim het adres niet en bevat de invoer een huisnummer, dan volgt
 * één tweede poging zonder huisnummer. Gooit nooit — geeft `null` bij lege
 * invoer, geen resultaat, of een netwerk-/HTTP-fout, zodat de aanroeper
 * (`actions.ts`) daar zelf een formuliermelding van maakt.
 */
export async function resolveStationLocation(
  input: string,
  options: { retryDelayMs?: number } = {},
): Promise<ResolvedLocation | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const coordinates = parseCoordinates(trimmed);
  if (coordinates) {
    return { ...coordinates, name: formatCoordinateName(coordinates.latitude, coordinates.longitude) };
  }

  const first = await searchNominatim(trimmed);
  if (first) return first;
  if (first === undefined) return null;

  const withoutNumber = stripHouseNumber(trimmed);
  if (!withoutNumber) return null;
  await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
  return (await searchNominatim(withoutNumber)) ?? null;
}
