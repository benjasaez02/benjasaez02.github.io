import workerV8 from "./worker-v8";

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
  source: string;
}

interface LinkCandidate {
  index: number;
  end: number;
  title: string;
  link: string;
}

interface MoneyCandidate {
  amount: number;
  index: number;
  original: boolean;
  installment: boolean;
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "9.0.0",
        searchMode: "single-snapshot-markdown-html-parser",
        browserBinding: Boolean(env.BROWSER),
        cacheSeconds: 900,
        aiExtraction: false,
      });
    }

    if (request.method === "GET" && path === "/api/search") {
      const authError = authorize(request, env);
      if (authError) return authError;
      return searchFromSnapshot(url, env, ctx);
    }

    return workerV8.fetch(request, env as never, ctx as never);
  },
};

async function searchFromSnapshot(url: URL, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "invalid_query", message: "El parámetro q es obligatorio" }, 400);
  if (!env.BROWSER) return json({ error: "browser_binding_missing", message: "Falta el binding BROWSER" }, 500);

  const limit = clamp(url.searchParams.get("limit"), 1, 20, 10);
  const sort = normalizeSort(url.searchParams.get("sort"));
  const searchUrl = `https://listado.mercadolibre.cl/${slug(q)}`;
  const cache = defaultCache();
  const cacheKey = new Request(
    `https://cache.ofertasflash.local/meli-v9?q=${encodeURIComponent(normal(q))}&limit=${limit}&sort=${sort}`,
  );

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("x-ofertasflash-cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  let snapshotResponse: Response;
  try {
    snapshotResponse = await env.BROWSER.quickAction("snapshot", {
      url: searchUrl,
      formats: ["content", "markdown", "accessibilityTree"],
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
      error: "browser_snapshot_failed",
      message: error instanceof Error ? error.message : "Browser Run no pudo capturar la búsqueda",
      searchUrl,
      retryAfterSeconds: 60,
    }, 502);
  }

  const browserMs = numericHeader(snapshotResponse, "x-browser-ms-used");
  const retryAfter = parseRetryAfter(snapshotResponse.headers.get("retry-after"));
  const raw = await snapshotResponse.text();

  if (!snapshotResponse.ok) {
    const isRateLimit = snapshotResponse.status === 429 || /rate limit/i.test(raw);
    return jsonWithHeaders({
      error: isRateLimit ? "browser_rate_limited" : "browser_snapshot_http_error",
      status: snapshotResponse.status,
      detail: raw.slice(0, 1000),
      searchUrl,
      retryAfterSeconds: isRateLimit ? retryAfter : null,
      diagnostics: { browserMs, browserRequestsUsed: 1, cache: "MISS" },
    }, isRateLimit ? 429 : 502, isRateLimit ? { "retry-after": String(retryAfter) } : {});
  }

  const envelope = parseObject(raw);
  const result = objectValue(envelope.result) || envelope;
  const content = stringValue(result.content) || "";
  const markdown = stringValue(result.markdown) || "";
  const accessibilityTree = result.accessibilityTree;

  const markdownOffers = extractMarkdownOffers(markdown, q);
  const htmlOffers = extractHtmlOffers(content, q);
  const merged = dedupe([...markdownOffers, ...htmlOffers]);

  if (sort === "price_asc") merged.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") merged.sort((a, b) => b.price - a.price);

  const results = merged.slice(0, limit);
  const productLinksInHtml = extractProductLinks(content).length;
  const productLinksInMarkdown = extractMarkdownLinks(markdown).length;
  const accessibilityNodes = countAccessibilityNodes(accessibilityTree);
  const response = jsonWithHeaders({
    query: q,
    source: "Mercado Libre Chile renderizado en una captura única; extracción determinista desde Markdown y HTML",
    searchUrl,
    fetchedAt: new Date().toISOString(),
    paging: { requested: limit, returned: results.length, validatedCandidates: merged.length },
    diagnostics: {
      browserMs,
      browserRequestsUsed: 1,
      cache: "MISS",
      contentLength: content.length,
      markdownLength: markdown.length,
      accessibilityNodes,
      productLinksInHtml,
      productLinksInMarkdown,
      markdownCandidates: markdownOffers.length,
      htmlCandidates: htmlOffers.length,
      aiExtractionUsed: false,
      validation: "Cada resultado exige URL real de producto MLC, título relacionado y precio CLP visible en el mismo bloque.",
    },
    results,
    note: results.length
      ? "Los precios fueron asociados de forma determinista a enlaces reales dentro de la misma tarjeta o bloque visible. Precio y stock pueden cambiar."
      : "La captura contiene la página renderizada, pero no se pudo asociar de forma segura un precio visible con un enlace de producto.",
  }, 200, { "cache-control": "public, max-age=60, s-maxage=900", "x-ofertasflash-cache": "MISS" });

  if (cache) {
    const put = cache.put(cacheKey, response.clone());
    if (ctx) ctx.waitUntil(put);
    else await put;
  }
  return response;
}

function extractMarkdownOffers(markdown: string, query: string): Offer[] {
  const links = extractMarkdownLinks(markdown);
  const offers: Offer[] = [];

  for (let i = 0; i < links.length; i += 1) {
    const current = links[i];
    const previousEnd = i > 0 ? links[i - 1].end : 0;
    const nextStart = i + 1 < links.length ? links[i + 1].index : markdown.length;
    const start = Math.max(previousEnd, current.index - 900);
    const end = Math.min(nextStart, current.end + 2200);
    const segment = markdown.slice(start, end);
    const relativeLinkEnd = current.end - start;
    const money = selectMoney(segment, relativeLinkEnd);
    const title = cleanTitle(current.title);
    if (!title || !money || relevance(query, title) < 0.18) continue;

    const ref = mercadoLibreReference(current.link);
    if (!ref.id) continue;
    offers.push(makeOffer({
      title,
      price: money.current,
      originalPrice: money.original,
      permalink: current.link,
      itemId: ref.kind === "item" ? ref.id : null,
      productId: ref.kind === "product" ? ref.id : null,
      sellerNickname: captureText(segment, /(?:Vendido por|Por)\s+([^\n|]{2,80})/i),
      rating: captureNumber(segment, /(?:Calificación|rating)\s*[: ]\s*([0-5](?:[.,]\d)?)/i),
      shippingText: captureText(segment, /(Envío gratis[^\n]{0,80}|Llega[^\n]{0,80})/i),
      condition: /\bUsado\b/i.test(segment) ? "used" : /\bNuevo\b/i.test(segment) ? "new" : null,
      source: "snapshot_markdown",
    }));
  }
  return offers;
}

function extractHtmlOffers(html: string, query: string): Offer[] {
  const anchors: LinkCandidate[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(match[1], "href");
    const link = normalizeProductLink(href);
    if (!link) continue;
    const title = cleanTitle(stripTags(match[2])) || cleanTitle(attribute(match[1], "title") || "");
    anchors.push({
      index: match.index || 0,
      end: (match.index || 0) + match[0].length,
      title,
      link,
    });
  }

  const offers: Offer[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const current = anchors[i];
    const previousEnd = i > 0 ? anchors[i - 1].end : 0;
    const nextStart = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
    const start = Math.max(previousEnd, current.index - 3500);
    const end = Math.min(nextStart, current.end + 9000);
    const segment = html.slice(start, end);
    const relativeLinkEnd = current.end - start;
    const title = current.title || titleNearAnchor(segment, relativeLinkEnd);
    const money = selectMoney(stripTagsPreservingBreaks(segment), relativeLinkEnd);
    if (!title || !money || relevance(query, title) < 0.18) continue;

    const ref = mercadoLibreReference(current.link);
    if (!ref.id) continue;
    offers.push(makeOffer({
      title,
      price: money.current,
      originalPrice: money.original,
      permalink: current.link,
      itemId: ref.kind === "item" ? ref.id : null,
      productId: ref.kind === "product" ? ref.id : null,
      sellerNickname: captureText(stripTagsPreservingBreaks(segment), /(?:Vendido por|Por)\s+([^\n|]{2,80})/i),
      rating: captureNumber(stripTagsPreservingBreaks(segment), /(?:Calificación|rating)\s*[: ]\s*([0-5](?:[.,]\d)?)/i),
      shippingText: captureText(stripTagsPreservingBreaks(segment), /(Envío gratis[^\n]{0,80}|Llega[^\n]{0,80})/i),
      condition: /\bUsado\b/i.test(stripTags(segment)) ? "used" : /\bNuevo\b/i.test(stripTags(segment)) ? "new" : null,
      source: "snapshot_html",
    }));
  }
  return offers;
}

function extractMarkdownLinks(markdown: string): LinkCandidate[] {
  const output: LinkCandidate[] = [];
  for (const match of markdown.matchAll(/\[([^\]]{1,500})\]\((https?:\/\/[^)\s]+)\)/g)) {
    const link = normalizeProductLink(match[2]);
    if (!link) continue;
    output.push({
      index: match.index || 0,
      end: (match.index || 0) + match[0].length,
      title: cleanTitle(match[1]),
      link,
    });
  }
  return output;
}

function extractProductLinks(html: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const link = normalizeProductLink(match[1]);
    if (link) links.add(link);
  }
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+/gi)) {
    const link = normalizeProductLink(match[0]);
    if (link) links.add(link);
  }
  return [...links];
}

function selectMoney(segment: string, referenceIndex: number): { current: number; original: number | null } | null {
  const candidates = moneyCandidates(segment);
  if (!candidates.length) return null;

  const valid = candidates.filter((candidate) => !candidate.installment && candidate.amount >= 500 && candidate.amount <= 100_000_000);
  if (!valid.length) return null;

  const currentCandidates = valid.filter((candidate) => !candidate.original);
  const after = currentCandidates.filter((candidate) => candidate.index >= referenceIndex && candidate.index - referenceIndex <= 1800);
  const before = currentCandidates.filter((candidate) => candidate.index < referenceIndex && referenceIndex - candidate.index <= 900);
  const currentCandidate = after[0]
    || [...before].sort((a, b) => b.index - a.index)[0]
    || [...currentCandidates].sort((a, b) => Math.abs(a.index - referenceIndex) - Math.abs(b.index - referenceIndex))[0];
  if (!currentCandidate) return null;

  const originalCandidate = valid
    .filter((candidate) => candidate.original && candidate.amount > currentCandidate.amount)
    .sort((a, b) => Math.abs(a.index - currentCandidate.index) - Math.abs(b.index - currentCandidate.index))[0];

  return { current: currentCandidate.amount, original: originalCandidate?.amount || null };
}

function moneyCandidates(value: string): MoneyCandidate[] {
  const output: MoneyCandidate[] = [];
  const pattern = /(?:CLP\s*|\$\s*)(\d{1,3}(?:[.\s]\d{3})+|\d{4,9})(?:,\d{1,2})?/gi;
  for (const match of value.matchAll(pattern)) {
    const index = match.index || 0;
    const amount = parseClp(match[1]);
    if (amount === null) continue;
    const before = value.slice(Math.max(0, index - 90), index);
    const around = value.slice(Math.max(0, index - 30), Math.min(value.length, index + match[0].length + 30));
    output.push({
      amount,
      index,
      original: /~~\s*$|<s\b|previous|original|antes\s*:?[\s\S]{0,12}$/i.test(before) || /precio anterior|antes/i.test(around),
      installment: /cuotas?|mensual|por mes|x\s*\d+|sin inter[eé]s|cada mes/i.test(before),
    });
  }
  return output;
}

function makeOffer(input: Omit<Offer, "discountPercent" | "currency">): Offer {
  const originalPrice = input.originalPrice && input.originalPrice > input.price ? input.originalPrice : null;
  return {
    ...input,
    originalPrice,
    discountPercent: originalPrice ? percentage(originalPrice - input.price, originalPrice) : null,
    currency: "CLP",
  };
}

function dedupe(offers: Offer[]): Offer[] {
  const map = new Map<string, Offer>();
  for (const offer of offers) {
    const key = offer.itemId || offer.productId || canonicalUrl(offer.permalink) || `${normal(offer.title)}:${offer.price}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, offer);
      continue;
    }
    map.set(key, {
      ...existing,
      ...offer,
      title: offer.title.length >= existing.title.length ? offer.title : existing.title,
      originalPrice: offer.originalPrice || existing.originalPrice,
      sellerNickname: offer.sellerNickname || existing.sellerNickname,
      rating: offer.rating ?? existing.rating,
      shippingText: offer.shippingText || existing.shippingText,
      condition: offer.condition || existing.condition,
      source: `${existing.source}+${offer.source}`,
    });
  }
  return [...map.values()];
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

function normalizeProductLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let decoded = decodeMarkup(value.trim());
  if (decoded.startsWith("//")) decoded = `https:${decoded}`;
  else if (decoded.startsWith("/")) decoded = `https://www.mercadolibre.cl${decoded}`;
  try {
    const url = new URL(decoded);
    for (const key of ["url", "redirect", "redirect_url", "go", "target"]) {
      const nested = url.searchParams.get(key);
      if (nested && /^https?:\/\//i.test(decodeURIComponent(nested))) {
        return normalizeProductLink(decodeURIComponent(nested));
      }
    }
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

function canonicalUrl(input: string): string | null {
  try {
    const url = new URL(input);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

function titleNearAnchor(segment: string, referenceIndex: number): string {
  const before = segment.slice(Math.max(0, referenceIndex - 1800), referenceIndex);
  const after = segment.slice(referenceIndex, Math.min(segment.length, referenceIndex + 1800));
  const candidates = [
    ...before.matchAll(/<(?:h2|h3|span|div)[^>]*>([\s\S]{4,400}?)<\/(?:h2|h3|span|div)>/gi),
    ...after.matchAll(/<(?:h2|h3|span|div)[^>]*>([\s\S]{4,400}?)<\/(?:h2|h3|span|div)>/gi),
  ].map((match) => cleanTitle(stripTags(match[1]))).filter(Boolean);
  return candidates.sort((a, b) => b.length - a.length)[0] || "";
}

function countAccessibilityNodes(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countAccessibilityNodes(child), 0);
  const object = objectValue(value);
  if (!object) return 0;
  return 1 + Object.values(object).reduce((sum, child) => sum + (child && typeof child === "object" ? countAccessibilityNodes(child) : 0), 0);
}

function defaultCache(): CacheLike | null {
  const globalWithCaches = globalThis as unknown as { caches?: { default?: CacheLike } };
  return globalWithCaches.caches?.default || null;
}

function parseObject(raw: string): Record<string, unknown> {
  try { return objectValue(JSON.parse(raw)) || {}; } catch { return {}; }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 60;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : 60;
}

function captureText(value: string, pattern: RegExp): string | null {
  return cleanTitle(value.match(pattern)?.[1] || "") || null;
}

function captureNumber(value: string, pattern: RegExp): number | null {
  const raw = value.match(pattern)?.[1];
  if (!raw) return null;
  const number = Number(raw.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function attribute(attrs: string, name: string): string | null {
  return attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || null;
}

function stripTags(value: string): string {
  return decodeMarkup(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function stripTagsPreservingBreaks(value: string): string {
  return decodeMarkup(value
    .replace(/<(?:br|\/p|\/div|\/li|\/h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n"));
}

function cleanTitle(value: string): string {
  const cleaned = decodeMarkup(value).replace(/[*_#`~]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || /^(ver|comprar|ir al producto|imagen|más información)$/i.test(cleaned)) return "";
  return cleaned.slice(0, 500);
}

function decodeMarkup(value: string): string {
  return value
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x2F;/gi, "/");
}

function parseClp(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const number = Number(digits);
  return Number.isFinite(number) ? number : null;
}

function relevance(query: string, title: string): number {
  const q = new Set(tokens(query));
  const t = new Set(tokens(title));
  if (!q.size || !t.size) return 0;
  let hits = 0;
  q.forEach((token) => { if (t.has(token)) hits += 1; });
  return hits / q.size + (normal(title).includes(normal(query)) ? 0.4 : 0);
}

function tokens(value: string): string[] {
  return normal(value).split(" ").filter((token) => token.length >= 2 && !["de", "la", "el", "en", "con", "para", "por"].includes(token));
}

function normal(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value: string): string {
  return normal(value).replace(/\s+/g, "-");
}

function percentage(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

function clamp(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeSort(value: string | null): "relevance" | "price_asc" | "price_desc" {
  return value === "price_asc" || value === "price_desc" ? value : "relevance";
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function json(data: unknown, status = 200): Response {
  return jsonWithHeaders(data, status, {});
}

function jsonWithHeaders(data: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...extra,
    },
  });
}
