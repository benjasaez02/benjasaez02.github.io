import workerV6 from "./worker-v6";

interface BrowserBinding {
  quickAction(action: string, input: Record<string, unknown>): Promise<Response>;
}

interface Env {
  CONNECTOR_API_KEY: string;
  BROWSER: BrowserBinding;
}

interface ExtractedProduct {
  title?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  link?: unknown;
  seller?: unknown;
  rating?: unknown;
  shipping?: unknown;
  condition?: unknown;
}

interface ValidatedOffer {
  itemId: string | null;
  productId: string | null;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: "CLP";
  permalink: string;
  sellerNickname: string | null;
  rating: number | null;
  shippingText: string | null;
  condition: string | null;
  source: "browser_run_ai_json_url_validated";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "7.0.0",
        searchMode: "browser-content-ai-json-url-validated",
        browserBinding: Boolean(env.BROWSER),
      });
    }

    if (request.method === "GET" && path === "/api/search") {
      const authError = authorize(request, env);
      if (authError) return authError;
      return semanticSearch(url, env);
    }

    return workerV6.fetch(request, env as never);
  },
};

async function semanticSearch(url: URL, env: Env): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "invalid_query", message: "El parámetro q es obligatorio" }, 400);
  if (!env.BROWSER) return json({ error: "browser_binding_missing", message: "Falta el binding BROWSER" }, 500);

  const limit = clamp(url.searchParams.get("limit"), 1, 20, 10);
  const sort = url.searchParams.get("sort") || "relevance";
  const searchUrl = `https://listado.mercadolibre.cl/${slug(q)}`;
  const browserOptions = {
    gotoOptions: { waitUntil: "networkidle2", timeout: 60000 },
    waitForTimeout: 3500,
    actionTimeout: 60000,
    rejectResourceTypes: ["image", "media", "font"],
    userAgent: "Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
    setExtraHTTPHeaders: { "Accept-Language": "es-CL,es;q=0.9" },
  };

  let contentResponse: Response;
  try {
    contentResponse = await env.BROWSER.quickAction("content", { url: searchUrl, ...browserOptions });
  } catch (error) {
    return json({
      error: "browser_content_failed",
      message: error instanceof Error ? error.message : "No se pudo renderizar Mercado Libre",
      searchUrl,
    }, 502);
  }

  const contentBrowserMs = numericHeader(contentResponse, "x-browser-ms-used");
  const contentRaw = await contentResponse.text();
  if (!contentResponse.ok) {
    return json({ error: "browser_content_http_error", status: contentResponse.status, detail: contentRaw.slice(0, 800), searchUrl }, 502);
  }

  const renderedHtml = unwrapQuickActionString(contentRaw);
  const actualLinks = extractProductLinks(renderedHtml);
  const actualLinkRefs = new Map<string, string>();
  const actualCanonical = new Map<string, string>();
  for (const link of actualLinks) {
    const ref = mercadoLibreReference(link);
    if (ref.id) actualLinkRefs.set(ref.id, link);
    const canonical = canonicalUrl(link);
    if (canonical) actualCanonical.set(canonical, link);
  }

  const visibleLinkList = actualLinks.slice(0, 40).map((link, index) => `${index + 1}. ${link}`).join("\n");
  const prompt = [
    `Extrae únicamente las publicaciones visibles de Mercado Libre Chile relacionadas con: ${q}.`,
    "Devuelve el título exacto, precio actual en pesos chilenos como número, precio anterior solo si aparece, enlace, vendedor, calificación, envío y condición.",
    "No infieras, no completes datos faltantes y no inventes enlaces ni precios.",
    "Ignora navegación, publicidad sin precio, categorías y enlaces que no sean publicaciones de productos.",
    "Los siguientes enlaces fueron encontrados literalmente en el HTML y son la única lista permitida para el campo link:",
    visibleLinkList || "No se detectaron enlaces válidos.",
  ].join("\n");

  let aiResponse: Response;
  try {
    aiResponse = await env.BROWSER.quickAction("json", {
      html: renderedHtml,
      prompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  price: { type: "number" },
                  originalPrice: { type: "number" },
                  link: { type: "string" },
                  seller: { type: "string" },
                  rating: { type: "number" },
                  shipping: { type: "string" },
                  condition: { type: "string" },
                },
                required: ["title", "price", "link"],
              },
            },
          },
          required: ["products"],
        },
      },
    });
  } catch (error) {
    return json({
      error: "browser_json_failed",
      message: error instanceof Error ? error.message : "La extracción semántica falló",
      searchUrl,
      diagnostics: { htmlLength: renderedHtml.length, actualProductLinks: actualLinks.length, contentBrowserMs },
    }, 502);
  }

  const jsonBrowserMs = numericHeader(aiResponse, "x-browser-ms-used");
  const aiRaw = await aiResponse.text();
  if (!aiResponse.ok) {
    return json({
      error: "browser_json_http_error",
      status: aiResponse.status,
      detail: aiRaw.slice(0, 1000),
      searchUrl,
      diagnostics: { htmlLength: renderedHtml.length, actualProductLinks: actualLinks.length, contentBrowserMs, jsonBrowserMs },
    }, 502);
  }

  const aiResult = unwrapQuickActionObject(aiRaw);
  const productsValue = isObject(aiResult) && Array.isArray(aiResult.products) ? aiResult.products : [];
  const extracted = productsValue.filter(isObject) as ExtractedProduct[];
  const validated: ValidatedOffer[] = [];
  let invalidLinkCount = 0;
  let invalidPriceCount = 0;
  let irrelevantCount = 0;

  for (const candidate of extracted) {
    const title = stringValue(candidate.title);
    const price = numberValue(candidate.price);
    const proposedLink = stringValue(candidate.link);
    if (!title || price === null || price < 500) { invalidPriceCount += 1; continue; }
    if (!proposedLink) { invalidLinkCount += 1; continue; }
    if (relevance(q, title) < 0.18) { irrelevantCount += 1; continue; }

    const matchedLink = matchActualLink(proposedLink, actualLinkRefs, actualCanonical);
    if (!matchedLink) { invalidLinkCount += 1; continue; }

    const reference = mercadoLibreReference(matchedLink);
    const previous = numberValue(candidate.originalPrice);
    const originalPrice = previous !== null && previous > price ? previous : null;
    validated.push({
      itemId: reference.kind === "item" ? reference.id : null,
      productId: reference.kind === "product" ? reference.id : null,
      title,
      price,
      originalPrice,
      discountPercent: originalPrice ? percentage(originalPrice - price, originalPrice) : null,
      currency: "CLP",
      permalink: matchedLink,
      sellerNickname: stringValue(candidate.seller) || null,
      rating: numberValue(candidate.rating),
      shippingText: stringValue(candidate.shipping) || null,
      condition: normalizeCondition(stringValue(candidate.condition)),
      source: "browser_run_ai_json_url_validated",
    });
  }

  const unique = dedupe(validated);
  if (sort === "price_asc") unique.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") unique.sort((a, b) => b.price - a.price);

  const results = unique.slice(0, limit);
  return json({
    query: q,
    source: "Cloudflare Browser Run + extracción semántica con enlaces validados contra el HTML real",
    searchUrl,
    fetchedAt: new Date().toISOString(),
    paging: { requested: limit, returned: results.length, validatedCandidates: unique.length },
    diagnostics: {
      htmlLength: renderedHtml.length,
      actualProductLinks: actualLinks.length,
      aiCandidates: extracted.length,
      rejectedInvalidLinks: invalidLinkCount,
      rejectedInvalidPrices: invalidPriceCount,
      rejectedIrrelevant: irrelevantCount,
      contentBrowserMs,
      jsonBrowserMs,
      grounding: "Cada resultado se acepta solo si su enlace existe en el HTML renderizado.",
    },
    results,
    note: results.length
      ? "Precios extraídos semánticamente y enlaces verificados contra la página renderizada. Precio y stock pueden cambiar."
      : "La página contenía enlaces, pero la extracción no encontró una combinación verificable de título, precio y enlace.",
  });
}

function authorize(request: Request, env: Env): Response | null {
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : request.headers.get("x-connector-key")?.trim() || "";
  return !env.CONNECTOR_API_KEY || supplied !== env.CONNECTOR_API_KEY
    ? json({ error: "unauthorized", message: "Falta una clave válida del conector" }, 401)
    : null;
}

function unwrapQuickActionString(raw: string): string {
  try {
    const envelope = JSON.parse(raw) as { result?: unknown };
    return typeof envelope.result === "string" ? envelope.result : raw;
  } catch { return raw; }
}

function unwrapQuickActionObject(raw: string): unknown {
  try {
    const envelope = JSON.parse(raw) as { result?: unknown };
    return envelope.result ?? envelope;
  } catch { return {}; }
}

function extractProductLinks(html: string): string[] {
  const candidates: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) candidates.push(match[1]);
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+/gi)) candidates.push(match[0]);

  const output = new Set<string>();
  for (const raw of candidates) {
    const decoded = decodeMarkup(raw);
    const absolute = toAbsoluteUrl(decoded);
    if (!absolute) continue;
    const unwrapped = unwrapTrackingUrl(absolute);
    if (!isMercadoLibreProductUrl(unwrapped)) continue;
    output.add(unwrapped);
  }
  return [...output];
}

function unwrapTrackingUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of ["url", "redirect", "redirect_url", "go", "target"]) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      const decoded = decodeURIComponent(nested);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url.toString();
  } catch { return input; }
}

function isMercadoLibreProductUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!/(^|\.)mercadolibre\.cl$/i.test(url.hostname)) return false;
    return /\/MLC-\d+-|\/p\/MLC\d+|\bMLC\d{6,}\b/i.test(`${url.pathname}${url.search}`);
  } catch { return false; }
}

function matchActualLink(proposed: string, byRef: Map<string, string>, byCanonical: Map<string, string>): string | null {
  const absolute = toAbsoluteUrl(decodeMarkup(proposed));
  if (!absolute) return null;
  const unwrapped = unwrapTrackingUrl(absolute);
  const ref = mercadoLibreReference(unwrapped);
  if (ref.id && byRef.has(ref.id)) return byRef.get(ref.id) || null;
  const canonical = canonicalUrl(unwrapped);
  return canonical ? byCanonical.get(canonical) || null : null;
}

function mercadoLibreReference(input: string): { id: string | null; kind: "item" | "product" | null } {
  const item = input.match(/\/MLC-(\d{6,})-/i);
  if (item) return { id: `MLC${item[1]}`, kind: "item" };
  const id = input.toUpperCase().match(/MLC\d{6,}/)?.[0] || null;
  if (!id) return { id: null, kind: null };
  return /\/P\/MLC\d+/i.test(input) ? { id, kind: "product" } : { id, kind: "item" };
}

function canonicalUrl(input: string): string | null {
  try {
    const url = new URL(input);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "").toLowerCase()}`;
  } catch { return null; }
}

function toAbsoluteUrl(input: string): string | null {
  try { return new URL(input, "https://listado.mercadolibre.cl").toString(); }
  catch { return null; }
}

function decodeMarkup(value: string): string {
  return value
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function dedupe(offers: ValidatedOffer[]): ValidatedOffer[] {
  const map = new Map<string, ValidatedOffer>();
  for (const offer of offers) {
    const key = offer.itemId || offer.productId || canonicalUrl(offer.permalink) || `${normalize(offer.title)}:${offer.price}`;
    const old = map.get(key);
    if (!old || completeness(offer) > completeness(old)) map.set(key, offer);
  }
  return [...map.values()];
}

function completeness(offer: ValidatedOffer): number {
  return [offer.originalPrice, offer.sellerNickname, offer.rating, offer.shippingText, offer.condition].filter((value) => value !== null).length;
}

function relevance(query: string, title: string): number {
  const queryTokens = new Set(tokens(query));
  const titleTokens = new Set(tokens(title));
  let matches = 0;
  queryTokens.forEach((token) => { if (titleTokens.has(token)) matches += 1; });
  return queryTokens.size ? matches / queryTokens.size + (normalize(title).includes(normalize(query)) ? 0.35 : 0) : 0;
}

function normalizeCondition(value?: string): string | null {
  if (!value) return null;
  const normalized = normalize(value);
  if (/usado|used|open box|openbox|reacondicionado/.test(normalized)) return "used_or_open_box";
  if (/nuevo|new/.test(normalized)) return "new";
  return value.slice(0, 80);
}

function numericHeader(response: Response, name: string): number | null {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.,]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/\./g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function percentage(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter((token) => token.length >= 2);
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value: string): string { return normalize(value).replace(/\s+/g, "-"); }
function clamp(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function normalizePath(pathname: string): string { return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname; }
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}
