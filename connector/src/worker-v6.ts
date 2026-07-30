import workerV5 from "./worker-v5";

interface BrowserBinding {
  quickAction(action: string, input: Record<string, unknown>): Promise<Response>;
}

interface Env {
  CONNECTOR_API_KEY: string;
  BROWSER: BrowserBinding;
}

interface Offer {
  itemId: string | null;
  productId: string | null;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: string;
  permalink: string | null;
  sellerNickname: string | null;
  rating: number | null;
  shippingText: string | null;
  condition: string | null;
  source: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "6.0.0",
        searchMode: "cloudflare-browser-run",
        browserBinding: Boolean(env.BROWSER),
      });
    }

    if (request.method === "GET" && path === "/api/search") {
      const authError = authorize(request, env);
      if (authError) return authError;
      return searchWithBrowser(url, env);
    }

    return workerV5.fetch(request, env as never);
  },
};

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function authorize(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get("authorization") || "";
  const supplied = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : request.headers.get("x-connector-key")?.trim() || "";
  if (!env.CONNECTOR_API_KEY || supplied !== env.CONNECTOR_API_KEY) {
    return json({ error: "unauthorized", message: "Falta una clave válida del conector" }, 401);
  }
  return null;
}

async function searchWithBrowser(url: URL, env: Env): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "invalid_query", message: "El parámetro q es obligatorio" }, 400);

  const limit = clamp(url.searchParams.get("limit"), 1, 20, 10);
  const sort = url.searchParams.get("sort") || "relevance";
  const searchUrl = `https://listado.mercadolibre.cl/${slug(q)}`;

  if (!env.BROWSER) {
    return json({
      error: "browser_binding_missing",
      message: "Falta el binding BROWSER de Cloudflare Browser Run.",
    }, 500);
  }

  let browserResponse: Response;
  try {
    browserResponse = await env.BROWSER.quickAction("content", {
      url: searchUrl,
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 60000,
      },
      waitForTimeout: 3500,
      actionTimeout: 60000,
      rejectResourceTypes: ["image", "media", "font"],
      userAgent: "Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      setExtraHTTPHeaders: {
        "Accept-Language": "es-CL,es;q=0.9",
      },
    });
  } catch (error) {
    return json({
      error: "browser_run_failed",
      message: error instanceof Error ? error.message : "Browser Run no pudo abrir Mercado Libre",
      searchUrl,
    }, 502);
  }

  const browserMs = browserResponse.headers.get("x-browser-ms-used");
  const raw = await browserResponse.text();
  if (!browserResponse.ok) {
    return json({
      error: "browser_run_http_error",
      status: browserResponse.status,
      detail: raw.slice(0, 800),
      searchUrl,
      browserMs,
    }, 502);
  }

  let renderedHtml = "";
  try {
    const envelope = JSON.parse(raw) as { success?: boolean; result?: unknown; errors?: unknown };
    if (envelope.success && typeof envelope.result === "string") renderedHtml = envelope.result;
    else if (typeof envelope.result === "string") renderedHtml = envelope.result;
    else renderedHtml = raw;
  } catch {
    renderedHtml = raw;
  }

  const cardOffers = extractCards(renderedHtml);
  const embeddedOffers = extractEmbeddedJson(renderedHtml);
  const jsonLdOffers = extractJsonLd(renderedHtml);
  const merged = mergeOffers([...cardOffers, ...embeddedOffers, ...jsonLdOffers])
    .filter((offer) => relevance(q, offer.title) >= 0.2);

  if (sort === "price_asc") merged.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") merged.sort((a, b) => b.price - a.price);

  const results = merged.slice(0, limit);
  const pageTitle = clean(renderedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const blocked = /captcha|access denied|acceso denegado|robot|unusual traffic|tráfico inusual|no pudimos acceder|seguridad/i
    .test(`${pageTitle} ${clean(renderedHtml.slice(0, 12000))}`);
  const productLinks = (renderedHtml.match(/https?:[^"'\s<]*mercadolibre\.cl[^"'\s<]*/gi) || []).length;

  return json({
    query: q,
    source: "Mercado Libre Chile renderizado con Cloudflare Browser Run",
    searchUrl,
    fetchedAt: new Date().toISOString(),
    paging: { requested: limit, extractedWithPrice: merged.length, returned: results.length },
    diagnostics: {
      browserMs: browserMs ? Number(browserMs) : null,
      htmlLength: renderedHtml.length,
      pageTitle,
      possibleBotBlock: blocked,
      productLinks,
      cards: cardOffers.length,
      embeddedJson: embeddedOffers.length,
      jsonLd: jsonLdOffers.length,
    },
    results,
    note: results.length
      ? "Precios y enlaces extraídos después de renderizar la búsqueda en un navegador real. Precio y stock pueden cambiar."
      : blocked
        ? "Mercado Libre mostró una verificación o bloqueo al navegador automatizado."
        : "La página se renderizó, pero no expuso tarjetas de producto compatibles con el extractor.",
  });
}

function extractCards(html: string): Offer[] {
  const output: Offer[] = [];
  const anchors: Array<{ index: number; attrs: string; body: string }> = [];

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1];
    const href = attr(attrs, "href");
    const combined = `${attrs} ${match[2]}`;
    if (!href || !/mercadolibre\.cl/i.test(href)) continue;
    if (!/(poly-component__title|ui-search-link|ui-search-item__group__element|poly-card|MLC-\d+)/i.test(combined + href)) continue;
    anchors.push({ index: match.index || 0, attrs, body: match[2] });
  }

  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    const start = Math.max(0, anchor.index - 2500);
    const end = Math.min(anchors[i + 1]?.index || html.length, anchor.index + 11000);
    const segment = html.slice(start, end);
    const permalink = decodeHtml(attr(anchor.attrs, "href") || "");
    const title = clean(anchor.body) || clean(attr(anchor.attrs, "title") || "");
    const amounts = moneyAmounts(segment);
    const current = amounts.find((entry) => !entry.previous)?.amount;
    if (!title || current === undefined || current < 500) continue;
    const previous = amounts.find((entry) => entry.previous && entry.amount > current)?.amount || null;
    output.push(makeOffer({
      title,
      price: current,
      originalPrice: previous,
      permalink,
      sellerNickname: textByClass(segment, "poly-component__seller"),
      rating: numberMatch(segment, /poly-reviews__rating[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)/i),
      shippingText: shipping(segment),
      condition: /\bUsado\b/i.test(clean(segment)) ? "used" : /\bNuevo\b/i.test(clean(segment)) ? "new" : null,
      source: "rendered_search_card",
    }));
  }
  return output;
}

function extractEmbeddedJson(html: string): Offer[] {
  const output: Offer[] = [];
  for (const match of html.matchAll(/["'](?:id|item_id|itemId)["']\s*:\s*["'](MLC\d+)["']/gi)) {
    const index = match.index || 0;
    const window = unescapeJson(html.slice(Math.max(0, index - 3000), Math.min(html.length, index + 8000)));
    const title = stringMatch(window, /["'](?:title|name)["']\s*:\s*["']((?:\\.|[^"'])+)["']/i);
    const price = numberMatch(window, /["'](?:price|amount)["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (!title || price === null || price < 500) continue;
    const original = numberMatch(window, /["'](?:original_price|regular_amount)["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const permalink = stringMatch(window, /["'](?:permalink|url)["']\s*:\s*["']((?:\\.|[^"'])+)["']/i);
    output.push(makeOffer({
      itemId: match[1].toUpperCase(),
      title: unescapeJson(title),
      price,
      originalPrice: original && original > price ? original : null,
      permalink: permalink ? unescapeJson(permalink) : null,
      source: "rendered_embedded_json",
    }));
  }
  return output;
}

function extractJsonLd(html: string): Offer[] {
  const output: Offer[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walkJson(JSON.parse(decodeHtml(match[1]).trim()), output); } catch { /* ignore malformed JSON-LD */ }
  }
  return output;
}

function walkJson(value: unknown, output: Offer[]): void {
  if (Array.isArray(value)) { value.forEach((entry) => walkJson(entry, output)); return; }
  const obj = asObject(value);
  if (!obj) return;
  const name = asText(obj.name);
  const offerObject = asObject(obj.offers) || (Array.isArray(obj.offers) ? asObject(obj.offers[0]) : null);
  if (name && offerObject) {
    const price = money(offerObject.price) ?? money(offerObject.lowPrice);
    if (price !== null && price >= 500) {
      const high = money(offerObject.highPrice);
      output.push(makeOffer({
        title: name,
        price,
        originalPrice: high && high > price ? high : null,
        permalink: asText(obj.url) || asText(offerObject.url) || null,
        source: "rendered_json_ld",
      }));
    }
  }
  Object.values(obj).forEach((child) => { if (child && typeof child === "object") walkJson(child, output); });
}

function moneyAmounts(segment: string): Array<{ amount: number; previous: boolean }> {
  const output: Array<{ amount: number; previous: boolean }> = [];
  for (const match of segment.matchAll(/<(span|s)\b([^>]*(?:andes-money-amount|price-tag)[^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = match[2];
    const body = match[3];
    let amount = parseClp(attr(attrs, "aria-label") || "");
    if (amount === null) {
      const fraction = body.match(/andes-money-amount__fraction[^>]*>([0-9.]+)/i)?.[1];
      if (fraction) amount = parseClp(fraction);
    }
    if (amount === null || amount <= 0) continue;
    output.push({ amount, previous: /previous|original|<s\b/i.test(`${attrs} ${match[0].slice(0, 40)}`) });
  }
  return output;
}

function mergeOffers(offers: Offer[]): Offer[] {
  const map = new Map<string, Offer>();
  for (const offer of offers) {
    const key = offer.itemId || offer.permalink || `${normal(offer.title)}:${offer.price}`;
    const old = map.get(key);
    map.set(key, old ? {
      ...old,
      ...offer,
      itemId: offer.itemId || old.itemId,
      productId: offer.productId || old.productId,
      permalink: offer.permalink || old.permalink,
      sellerNickname: offer.sellerNickname || old.sellerNickname,
      originalPrice: offer.originalPrice || old.originalPrice,
      rating: offer.rating || old.rating,
      shippingText: offer.shippingText || old.shippingText,
      source: `${old.source}+${offer.source}`,
    } : offer);
  }
  return [...map.values()];
}

function makeOffer(input: Partial<Offer> & Pick<Offer, "title" | "price" | "source">): Offer {
  const permalink = input.permalink ? decodeHtml(unescapeJson(input.permalink)) : null;
  const ids = permalink ? reference(permalink) : {};
  const originalPrice = input.originalPrice ?? null;
  return {
    itemId: input.itemId || ids.itemId || null,
    productId: input.productId || ids.productId || null,
    title: clean(input.title),
    price: input.price,
    originalPrice,
    discountPercent: originalPrice && originalPrice > input.price ? percent(originalPrice - input.price, originalPrice) : null,
    currency: input.currency || "CLP",
    permalink,
    sellerNickname: input.sellerNickname || null,
    rating: input.rating ?? null,
    shippingText: input.shippingText || null,
    condition: input.condition || null,
    source: input.source,
  };
}

function reference(url: string): { itemId?: string; productId?: string } {
  const item = url.match(/\/MLC-([0-9]{6,})-/i);
  if (item) return { itemId: `MLC${item[1]}` };
  const id = url.toUpperCase().match(/MLC\d+/)?.[0];
  return id ? (/\/P\/MLC\d+/i.test(url) ? { productId: id } : { itemId: id }) : {};
}

function relevance(query: string, title: string): number {
  const q = new Set(tokens(query));
  const t = new Set(tokens(title));
  let hits = 0;
  q.forEach((token) => { if (t.has(token)) hits += 1; });
  return q.size ? hits / q.size + (normal(title).includes(normal(query)) ? 0.4 : 0) : 0;
}

function tokens(value: string): string[] { return normal(value).split(" ").filter((token) => token.length >= 2); }
function normal(value: string): string { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function slug(value: string): string { return normal(value).replace(/\s+/g, "-"); }
function attr(attrs: string, name: string): string | null { return attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || null; }
function clean(value: string): string { return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function textByClass(html: string, className: string): string | null { return clean(html.match(new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"))?.[1] || "") || null; }
function shipping(html: string): string | null { return clean(html).match(/(?:Llega.{0,70}|Envío gratis.{0,70}|Internacional.{0,70})/i)?.[0] || null; }
function stringMatch(value: string, pattern: RegExp): string | null { return value.match(pattern)?.[1] || null; }
function numberMatch(value: string, pattern: RegExp): number | null { const raw = value.match(pattern)?.[1]; if (!raw) return null; const n = Number(raw.replace(",", ".")); return Number.isFinite(n) ? n : null; }
function parseClp(value: string): number | null { const cleaned = value.replace(/[^0-9.,]/g, ""); if (!cleaned) return null; const n = Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/\./g, "")); return Number.isFinite(n) ? n : null; }
function money(value: unknown): number | null { if (typeof value === "number" && Number.isFinite(value)) return value; return typeof value === "string" ? parseClp(value) : null; }
function decodeHtml(value: string): string { return value.replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#x2F;/gi, "/"); }
function unescapeJson(value: string): string { return value.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/\\u0026/gi, "&"); }
function asObject(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function asText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function percent(part: number, total: number): number { return Math.round((part / total) * 1000) / 10; }
function clamp(value: string | null, min: number, max: number, fallback: number): number { const parsed = Number.parseInt(value || "", 10); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } }); }
