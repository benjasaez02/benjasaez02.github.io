import workerV7 from "./worker-v7";

interface BrowserBinding {
  quickAction(action: string, input: Record<string, unknown>): Promise<Response>;
}

interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
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
  resourceId?: unknown;
  seller?: unknown;
  rating?: unknown;
  shipping?: unknown;
  condition?: unknown;
}

interface Offer {
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
  source: "browser_run_json_single_request";
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "8.0.0",
        searchMode: "single-browser-json-request-with-cache",
        browserBinding: Boolean(env.BROWSER),
        cacheSeconds: 900,
      });
    }

    if (request.method === "GET" && path === "/api/search") {
      const authError = authorize(request, env);
      if (authError) return authError;
      return searchOnce(url, env, ctx);
    }

    return workerV7.fetch(request, env as never);
  },
};

async function searchOnce(url: URL, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "invalid_query", message: "El parámetro q es obligatorio" }, 400);
  if (!env.BROWSER) return json({ error: "browser_binding_missing", message: "Falta el binding BROWSER" }, 500);

  const limit = clamp(url.searchParams.get("limit"), 1, 20, 10);
  const sort = normalizeSort(url.searchParams.get("sort"));
  const searchUrl = `https://listado.mercadolibre.cl/${slug(q)}`;
  const cacheKey = new Request(`https://cache.ofertasflash.local/meli-v8?q=${encodeURIComponent(normal(q))}&limit=${limit}&sort=${sort}`);
  const cache = getDefaultCache();

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("x-ofertasflash-cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  const prompt = [
    `Extrae hasta ${Math.max(20, limit * 2)} publicaciones visibles de los resultados de Mercado Libre Chile relacionadas con: ${q}.`,
    "Para cada publicación copia literalmente desde la página: título, precio actual en pesos chilenos, precio anterior solo si aparece, enlace directo exacto y el identificador MLC contenido en ese enlace.",
    "Incluye vendedor, calificación, envío y condición solamente cuando aparezcan.",
    "No infieras, no completes, no calcules precios y no inventes enlaces. Ignora navegación, categorías, anuncios sin precio y productos no relacionados.",
    "El campo resourceId debe ser exactamente el MLC del enlace. Usa números sin símbolos ni separadores para los precios.",
  ].join("\n");

  let browserResponse: Response;
  try {
    browserResponse = await env.BROWSER.quickAction("json", {
      url: searchUrl,
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
                  resourceId: { type: "string" },
                  seller: { type: "string" },
                  rating: { type: "number" },
                  shipping: { type: "string" },
                  condition: { type: "string" },
                },
                required: ["title", "price", "link", "resourceId"],
              },
            },
          },
          required: ["products"],
        },
      },
      gotoOptions: { waitUntil: "networkidle2", timeout: 60000 },
      waitForTimeout: 3500,
      actionTimeout: 60000,
      rejectResourceTypes: ["image", "media", "font"],
      userAgent: "Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      setExtraHTTPHeaders: { "Accept-Language": "es-CL,es;q=0.9" },
      cacheTTL: 900,
    });
  } catch (error) {
    return json({
      error: "browser_json_failed",
      message: error instanceof Error ? error.message : "Browser Run no pudo procesar la búsqueda",
      searchUrl,
      retryAfterSeconds: 60,
    }, 502);
  }

  const browserMs = numericHeader(browserResponse, "x-browser-ms-used");
  const retryAfter = parseRetryAfter(browserResponse.headers.get("retry-after"));
  const raw = await browserResponse.text();

  if (!browserResponse.ok) {
    const isRateLimit = browserResponse.status === 429 || /rate limit/i.test(raw);
    return jsonWithHeaders({
      error: isRateLimit ? "browser_rate_limited" : "browser_json_http_error",
      status: browserResponse.status,
      detail: raw.slice(0, 1000),
      searchUrl,
      retryAfterSeconds: isRateLimit ? retryAfter : null,
      diagnostics: {
        browserMs,
        browserRequestsUsed: 1,
        cache: "MISS",
      },
      note: isRateLimit
        ? "Cloudflare limitó temporalmente Browser Run. Espera el tiempo indicado antes de repetir la búsqueda."
        : "Browser Run no pudo extraer los resultados.",
    }, isRateLimit ? 429 : 502, isRateLimit ? { "retry-after": String(retryAfter) } : {});
  }

  const result = unwrapQuickActionObject(raw);
  const products = isObject(result) && Array.isArray(result.products)
    ? result.products.filter(isObject) as ExtractedProduct[]
    : [];

  const validated: Offer[] = [];
  let invalidLinks = 0;
  let invalidPrices = 0;
  let mismatchedIds = 0;
  let irrelevant = 0;

  for (const candidate of products) {
    const title = stringValue(candidate.title);
    const price = numberValue(candidate.price);
    const resourceId = stringValue(candidate.resourceId)?.toUpperCase() || null;
    const link = normalizeProductLink(stringValue(candidate.link));

    if (!title || price === null || price < 500 || price > 100_000_000) {
      invalidPrices += 1;
      continue;
    }
    if (!link) {
      invalidLinks += 1;
      continue;
    }
    if (relevance(q, title) < 0.18) {
      irrelevant += 1;
      continue;
    }

    const reference = mercadoLibreReference(link);
    if (!reference.id || (resourceId && resourceId !== reference.id)) {
      mismatchedIds += 1;
      continue;
    }

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
      permalink: link,
      sellerNickname: stringValue(candidate.seller) || null,
      rating: numberValue(candidate.rating),
      shippingText: stringValue(candidate.shipping) || null,
      condition: normalizeCondition(stringValue(candidate.condition)),
      source: "browser_run_json_single_request",
    });
  }

  const unique = dedupe(validated);
  if (sort === "price_asc") unique.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") unique.sort((a, b) => b.price - a.price);

  const results = unique.slice(0, limit);
  const response = jsonWithHeaders({
    query: q,
    source: "Mercado Libre Chile mediante una única extracción estructurada de Cloudflare Browser Run",
    searchUrl,
    fetchedAt: new Date().toISOString(),
    paging: { requested: limit, returned: results.length, validatedCandidates: unique.length },
    diagnostics: {
      browserMs,
      browserRequestsUsed: 1,
      cache: "MISS",
      aiCandidates: products.length,
      rejectedInvalidLinks: invalidLinks,
      rejectedInvalidPrices: invalidPrices,
      rejectedMismatchedResourceIds: mismatchedIds,
      rejectedIrrelevant: irrelevant,
      validation: "Dominio Mercado Libre Chile, URL de producto y resourceId MLC coincidente.",
    },
    results,
    note: results.length
      ? "Se realizó una sola operación de navegador. Los precios provienen de la página renderizada y pueden cambiar."
      : "La extracción no produjo una combinación verificable de título, precio, URL de producto e identificador MLC.",
  }, 200, {
    "cache-control": "public, max-age=900",
    "x-ofertasflash-cache": "MISS",
  });

  if (cache && results.length) {
    const put = cache.put(cacheKey, response.clone());
    if (ctx) ctx.waitUntil(put);
    else await put;
  }

  return response;
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

function getDefaultCache(): CacheLike | null {
  return (globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default || null;
}

function unwrapQuickActionObject(raw: string): unknown {
  try {
    const envelope = JSON.parse(raw) as { result?: unknown };
    return envelope.result ?? envelope;
  } catch {
    return {};
  }
}

function normalizeProductLink(value: string | undefined): string | null {
  if (!value) return null;
  let candidate = decodeMarkup(value);
  try {
    const outer = new URL(candidate, "https://www.mercadolibre.cl");
    for (const key of ["url", "redirect", "redirect_url", "target", "go"]) {
      const nested = outer.searchParams.get(key);
      if (nested && /^https?:/i.test(decodeURIComponent(nested))) {
        candidate = decodeURIComponent(nested);
        break;
      }
    }
  } catch {
    return null;
  }

  try {
    const url = new URL(candidate, "https://www.mercadolibre.cl");
    if (!/(^|\.)mercadolibre\.cl$/i.test(url.hostname)) return null;
    if (!/\/MLC-\d+-|\/p\/MLC\d+|\bMLC\d{6,}\b/i.test(`${url.pathname}${url.search}`)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function mercadoLibreReference(input: string): { id: string | null; kind: "item" | "product" | null } {
  const item = input.match(/\/MLC-(\d{6,})-/i);
  if (item) return { id: `MLC${item[1]}`, kind: "item" };
  const id = input.toUpperCase().match(/MLC\d{6,}/)?.[0] || null;
  if (!id) return { id: null, kind: null };
  return /\/P\/MLC\d+/i.test(input) ? { id, kind: "product" } : { id, kind: "item" };
}

function dedupe(offers: Offer[]): Offer[] {
  const map = new Map<string, Offer>();
  for (const offer of offers) {
    const key = offer.itemId || offer.productId || offer.permalink;
    const current = map.get(key);
    if (!current || offer.price < current.price) map.set(key, offer);
  }
  return [...map.values()];
}

function normalizeCondition(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normal(value);
  if (/usado|used/.test(normalized)) return "used";
  if (/nuevo|new/.test(normalized)) return "new";
  if (/reacondicionado|refurbished|openbox|open box/.test(normalized)) return "refurbished";
  return value.slice(0, 80);
}

function relevance(query: string, title: string): number {
  const q = new Set(tokens(query));
  const t = new Set(tokens(title));
  let hits = 0;
  q.forEach((token) => { if (t.has(token)) hits += 1; });
  return q.size ? hits / q.size + (normal(title).includes(normal(query)) ? 0.4 : 0) : 0;
}

function parseRetryAfter(value: string | null): number {
  const seconds = Number.parseInt(value || "", 10);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 900) : 60;
}

function numericHeader(response: Response, name: string): number | null {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) ? value : null;
}

function normalizeSort(value: string | null): "relevance" | "price_asc" | "price_desc" {
  return value === "price_asc" || value === "price_desc" ? value : "relevance";
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function percentage(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

function tokens(value: string): string[] {
  return normal(value).split(" ").filter((token) => token.length >= 2);
}

function normal(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value: string): string {
  return normal(value).replace(/\s+/g, "-");
}

function decodeMarkup(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&");
}

function clamp(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function json(data: unknown, status = 200): Response {
  return jsonWithHeaders(data, status, {});
}

function jsonWithHeaders(data: unknown, status: number, extraHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
  });
}
