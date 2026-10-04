/**
 * Geocoding voor de "Locatie"-invoer bij stationbeheer: zet een door de
 * gebruiker getypte plaatsnaam, postcode of coördinatenpaar om naar
 * breedtegraad/lengtegraad plus een leesbare naam, voor gebruik in de
 * 5-daagse verwachting (`forecast.ts`) en het stationoverzicht
 * (`/station`).
 *
 * - Coördinaten (bv. "52.3676, 4.9041") worden rechtstreeks herkend, zonder
 *   netwerk.
 * - Al het andere (plaatsnaam, postcode, adres) wordt in Nederland gezocht
 *   bij Nominatim (OpenStreetMap) — gratis, geen sleutel nodig. Open-Meteo heeft ook een
 *   eigen, gratis geocoding-API, maar die doorzoekt alleen plaatsnamen en
 *   kent GEEN postcodes (geverifieerd: "1011 AB" levert daar nul resultaten
 *   op) — Nominatim kent beide.
 *   Zie https://nominatim.org/release-docs/latest/api/Search/ en het
 *   gebruiksbeleid https://operations.osmfoundation.org/policies/nominatim/:
 *   max. 1 aanvraag/seconde (hier ruimschoots onder — dit draait alleen bij
 *   het opslaan van een station in het beheerscherm) en een identificerende
 *   `User-Agent` — bewust ZONDER e-mailadres van de gebruiker/eigenaar
 *   hierin, alleen de projectnaam en -URL.
 *
 * Bewust alleen pure functies + één `fetch`-aanroep, net als forecast.ts,
 * zodat het grootste deel zonder netwerk getest kan worden (zie
 * tests/weather-geocode.test.ts).
 */

const NOMINATIM_USER_AGENT = "Weerstation-WS5500 (https://mijnweerstation.nl)";

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  /** Leesbare naam voor de verwachtingskaart en het stationoverzicht. */
  name: string;
}

/**
 * Herkent "lat, lon" (ook met puntkomma of alleen spatie als scheiding,
 * decimale punt). Retourneert `null` als de tekst geen geldig
 * coördinatenpaar is (dan behandelt `resolveStationLocation()` de invoer
 * als plaatsnaam/postcode).
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

  const address = first.address ?? {};
  const place =
    address.city || address.town || address.village || address.hamlet || address.municipality;
  const name =
    place && address.country
      ? `${place}, ${address.country}`
      : place || first.display_name || formatCoordinateName(latitude, longitude);

  return { latitude, longitude, name };
}

/**
 * Lost de "Locatie"-invoer van het stationformulier op naar coördinaten +
 * leesbare naam. Herkent eerst coördinaten (geen netwerk nodig); anders een
 * geocoding-aanvraag naar Nominatim. Gooit nooit — geeft `null` bij lege
 * invoer, geen resultaat, of een netwerk-/HTTP-fout, zodat de aanroeper
 * (`actions.ts`) daar zelf een formuliermelding van maakt.
 */
export async function resolveStationLocation(input: string): Promise<ResolvedLocation | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const coordinates = parseCoordinates(trimmed);
  if (coordinates) {
    return { ...coordinates, name: formatCoordinateName(coordinates.latitude, coordinates.longitude) };
  }

  try {
    const response = await fetch(buildGeocodeUrl(trimmed), {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parseGeocodeResponse(await response.json());
  } catch {
    return null;
  }
}
