/**
 * Tolerant inlezen van een inkomende ingestie-aanvraag.
 *
 * De opdracht voor Fase 2 vraagt expliciet om zowel form-urlencoded- als
 * query-string- als JSON-payloads te accepteren (het Ecowitt-"Customized"-
 * protocol gebruikt `POST` + form-urlencoded, de legacy Wunderground-variant
 * gebruikt `GET` + query-string, en een handmatige test kan JSON sturen).
 * Query-parameters en request-body worden altijd samengevoegd tot één plat
 * object — als eenzelfde veldnaam in beide voorkomt, wint de body.
 *
 * Deze functie gooit NOOIT een fout: een onleesbare/lege body levert simpelweg
 * een leeg body-deel op (de query-parameters blijven dan nog bruikbaar). De
 * aanroepende route-handler beslist wat een "lege" aanvraag betekent.
 */
import type { RawPayload } from "./types";

/** Defensieve bovengrens, los van (en kleiner dan) Vercel's eigen requestlimiet. */
export const MAX_BODY_BYTES = 256 * 1024; // 256 KB — een Ecowitt-payload is doorgaans < 2 KB.

export interface ParsedIncomingRequest {
  payload: RawPayload;
  bodyText: string | null;
  contentType: string | null;
  tooLarge: boolean;
}

function queryToPayload(url: URL): RawPayload {
  const payload: RawPayload = {};
  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }
  return payload;
}

function formUrlEncodedToPayload(bodyText: string): RawPayload {
  const payload: RawPayload = {};
  const params = new URLSearchParams(bodyText);
  for (const [key, value] of params.entries()) {
    payload[key] = value;
  }
  return payload;
}

function jsonToPayload(bodyText: string): RawPayload | undefined {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RawPayload;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function parseIncomingRequest(
  request: Request,
): Promise<ParsedIncomingRequest> {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type");
  const contentLengthHeader = request.headers.get("content-length");

  if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
    return { payload: queryToPayload(url), bodyText: null, contentType, tooLarge: true };
  }

  const queryPayload = queryToPayload(url);

  // GET-aanvragen (legacy Wunderground-protocol) hebben geen body.
  if (request.method === "GET" || request.method === "HEAD") {
    return { payload: queryPayload, bodyText: null, contentType, tooLarge: false };
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return { payload: queryPayload, bodyText: null, contentType, tooLarge: false };
  }

  if (bodyText.length > MAX_BODY_BYTES) {
    return { payload: queryPayload, bodyText: null, contentType, tooLarge: true };
  }

  if (bodyText.trim() === "") {
    return { payload: queryPayload, bodyText: null, contentType, tooLarge: false };
  }

  let bodyPayload: RawPayload | undefined;
  const normalizedContentType = (contentType ?? "").toLowerCase();

  if (normalizedContentType.includes("application/json")) {
    bodyPayload = jsonToPayload(bodyText);
  } else if (normalizedContentType.includes("application/x-www-form-urlencoded")) {
    bodyPayload = formUrlEncodedToPayload(bodyText);
  } else {
    // Onbekend/ontbrekend content-type-header: probeer eerst JSON, dan
    // form-urlencoded — sommige WS5500-firmwares sturen geen (correcte)
    // content-type mee.
    bodyPayload = jsonToPayload(bodyText) ?? formUrlEncodedToPayload(bodyText);
  }

  return {
    payload: { ...queryPayload, ...(bodyPayload ?? {}) },
    bodyText,
    contentType,
    tooLarge: false,
  };
}
