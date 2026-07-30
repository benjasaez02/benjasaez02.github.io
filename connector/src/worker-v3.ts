import workerV2 from "./worker-v2";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
interface D1Database { prepare(query: string): D1PreparedStatement; }
interface Env {
  DB: D1Database;
  ML_CLIENT_ID: string;
  ML_CLIENT_SECRET: string;
  ML_API_BASE?: string;
  TOKEN_ENCRYPTION_KEY: string;
  CONNECTOR_API_KEY: string;
}
interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number | string;
  scope?: string;
}
interface Offer {
  itemId: string | null;
  productId: string | null;
  title: string;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  soldQuantity: number | null;
  availableQuantity: number | null;
  sellerId: string | number | null;
  officialStoreId: number | null;
  permalink: string | null;
  thumbnail: string | null;
  shipping: Record<string, unknown> | null;
  condition: string | null;
  priceSource: string;
}

const SITE_ID = "MLC";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "3.0.0",
        searchMode: "catalog-children-sale-price",
      });
    }

    if (request.method === "GET" && path === "/api/search") {
      const authError = authorize(request, env);
      if (authError) return authError;
      try {
        return await searchHandler(url, env);
      } catch (error) {
        console.error(error);
        return json({
          error: "mercadolibre_connector_error",
          message: error instanceof Error ? error.message : "Error inesperado",
        }, 500);
      }
    }

    if (request.method === "POST" && path === "/api/analyze") {
      const authError = authorize(request, env);
      if (authError) return authError;
      try {
        return await analyzeHandler(request, env);
      } catch (error) {
        console.error(error);
        return json({
          error: "mercadolibre_connector_error",
          message: error instanceof Error ? error.message : "Error inesperado",
        }, 500);
      }
    }

    return workerV2.fetch(request, env as never);
  },
};

function authorize(request: Request, env: Env): Response | null {
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const custom = request.headers.get("x-connector-key")?.trim() || "";
  if (!env.CONNECTOR_API_KEY || (bearer || custom) !== env.CONNECTOR_API_KEY) {
    return json({ error: "unauthorized", message: "Falta una clave válida del conector" }, 401);
  }
  return null;
}

async function searchHandler(url: URL, env: Env): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "invalid_query", message: "El parámetro q es obligatorio" }, 400);

  const limit = clamp(url.searchParams.get("limit"), 1, 20, 10);
  const offset = clamp(url.searchParams.get("offset"), 0, 1000, 0);
  const sort = url.searchParams.get("sort") || "relevance";
  const poolSize = Math.min(50, Math.max(20, limit * 4));
  const params = new URLSearchParams({
    status: "active",
    site_id: SITE_ID,
    q,
    limit: String(poolSize),
    offset: String(offset),
  });

  const search = await mlFetch<{ results?: Record<string, unknown>[] }>(env, `/products/search?${params}`);
  const stubs = search.results || [];
  const resolved = await mapLimit(stubs, 4, async (stub) => {
    const productId = text(stub.id);
    return productId ? resolveProductOffer(productId, q, env) : null;
  });

  const unique = dedupeOffers(resolved.filter((offer): offer is Offer => Boolean(offer)));
  const priced = unique.filter((offer) => offer.price !== null);
  sortOffers(priced, sort);

  return json({
    query: q,
    source: "Mercado Libre /products/search → variantes comprables → /sale_price o /prices",
    paging: {
      requested: limit,
      catalogProductsInspected: stubs.length,
      pricedResults: priced.length,
      unpricedSkipped: unique.length - priced.length,
    },
    results: priced.slice(0, limit).map(normalizeOffer),
    note: priced.length
      ? "Solo se devuelven resultados con un precio comercial verificable mediante la API oficial."
      : "No se encontró una variante comprable con precio. Revisa que la aplicación tenga Publicación y sincronización en Solo lectura y vuelve a autorizar OAuth.",
  });
}

async function analyzeHandler(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const explicitItem = text(body.itemId)?.toUpperCase();
  const explicitProduct = text(body.productId)?.toUpperCase();
  const inputUrl = text(body.url);
  const query = text(body.query);
  const parsed = inputUrl ? parseReference(inputUrl) : {};

  const itemId = explicitItem || parsed.itemId;
  if (itemId) {
    return workerV2.fetch(cloneJsonRequest(request, body), env as never);
  }

  const productId = explicitProduct || parsed.productId;
  let offer: Offer | null = null;
  if (productId) offer = await resolveProductOffer(productId, query || productId, env);
  if (!offer && query) {
    const params = new URLSearchParams({ status: "active", site_id: SITE_ID, q: query, limit: "20" });
    const search = await mlFetch<{ results?: Record<string, unknown>[] }>(env, `/products/search?${params}`);
    for (const stub of search.results || []) {
      const id = text(stub.id);
      if (!id) continue;
      offer = await resolveProductOffer(id, query, env);
      if (offer?.itemId && offer.price !== null) break;
    }
  }

  if (!offer?.itemId) {
    return json({
      error: "unresolved_offer",
      message: "No pude resolver una publicación comprable con item_id. Activa Publicación y sincronización en Solo lectura y vuelve a autorizar la cuenta.",
    }, 400);
  }

  const delegatedBody = {
    itemId: offer.itemId,
    productId: offer.productId || productId,
    saveSnapshot: body.saveSnapshot !== false,
  };
  const response = await workerV2.fetch(cloneJsonRequest(request, delegatedBody), env as never);
  if (!response.ok) return response;

  const result = await response.json() as Record<string, unknown>;
  const item = object(result.item) || {};
  const analysis = object(result.analysis) || {};
  item.price = offer.price;
  item.originalPrice = offer.originalPrice;
  item.currency = offer.currency;
  item.permalink = offer.permalink || item.permalink;
  analysis.currentPrice = offer.price;
  analysis.originalPrice = offer.originalPrice;
  analysis.currency = offer.currency || analysis.currency;
  analysis.priceSource = offer.priceSource;
  result.item = item;
  result.analysis = analysis;
  return json(result);
}

async function resolveProductOffer(productId: string, query: string, env: Env): Promise<Offer | null> {
  const root = await tryMl<Record<string, unknown>>(env, `/products/${productId}`);
  if (!root) return null;

  const direct = await offerFromProduct(root, env);
  if (direct?.itemId && direct.price !== null) return direct;

  const candidateIds = collectChildProductIds(root).filter((id) => id !== productId).slice(0, 18);
  if (!candidateIds.length) return direct;

  const children = await mapLimit(candidateIds, 4, async (id) => tryMl<Record<string, unknown>>(env, `/products/${id}`));
  const offers = await mapLimit(children.filter((child): child is Record<string, unknown> => Boolean(child)), 4, (child) => offerFromProduct(child, env));
  const valid = offers.filter((offer): offer is Offer => Boolean(offer));
  if (!valid.length) return direct;

  valid.sort((a, b) => {
    const similarityDifference = similarity(query, b.title) - similarity(query, a.title);
    if (Math.abs(similarityDifference) > 0.01) return similarityDifference;
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
  });
  return valid.find((offer) => offer.itemId && offer.price !== null) || valid[0] || direct;
}

async function offerFromProduct(product: Record<string, unknown>, env: Env): Promise<Offer | null> {
  const winner = object(product.buy_box_winner);
  const priceRange = object(product.buy_box_winner_price_range);
  const minimum = object(priceRange?.min);
  const itemId = text(winner?.item_id) || text(winner?.id) || null;
  let item: Record<string, unknown> | null = null;
  let priceInfo: { price: number | null; originalPrice: number | null; currency: string | null; source: string } | null = null;

  if (itemId) {
    item = await tryMl<Record<string, unknown>>(env, `/items/${itemId}`);
    priceInfo = await getItemPrice(itemId, env);
  }

  const pictures = Array.isArray(product.pictures) ? product.pictures : [];
  const firstPicture = pictures.map(object).find(Boolean);
  const seller = object(winner?.seller);
  const price = priceInfo?.price ?? num(winner?.price) ?? num(item?.price) ?? num(minimum?.price);
  const originalPrice = priceInfo?.originalPrice ?? num(winner?.original_price) ?? num(item?.original_price);
  const currency = priceInfo?.currency || text(winner?.currency_id) || text(item?.currency_id) || text(minimum?.currency_id) || null;

  if (!text(product.id) && !itemId) return null;
  return {
    itemId,
    productId: text(product.id) || text(winner?.product_id) || null,
    title: text(product.name) || text(item?.title) || text(winner?.title) || "Producto sin título",
    price,
    originalPrice,
    currency,
    soldQuantity: num(winner?.sold_quantity) ?? num(item?.sold_quantity) ?? num(product.sold_quantity),
    availableQuantity: num(winner?.available_quantity) ?? num(item?.available_quantity),
    sellerId: (winner?.seller_id as string | number | undefined)
      ?? (item?.seller_id as string | number | undefined)
      ?? (seller?.id as string | number | undefined)
      ?? null,
    officialStoreId: num(winner?.official_store_id) ?? num(item?.official_store_id),
    permalink: text(item?.permalink) || text(winner?.permalink) || text(product.permalink) || null,
    thumbnail: text(item?.thumbnail) || text(firstPicture?.url) || text(firstPicture?.secure_url) || null,
    shipping: object(winner?.shipping) || object(item?.shipping),
    condition: text(winner?.condition) || text(item?.condition) || null,
    priceSource: priceInfo?.source || (num(winner?.price) !== null ? "buy_box_winner" : num(minimum?.price) !== null ? "buy_box_price_range" : "sin_precio"),
  };
}

async function getItemPrice(itemId: string, env: Env): Promise<{ price: number | null; originalPrice: number | null; currency: string | null; source: string }> {
  const sale = await tryMl<Record<string, unknown>>(env, `/items/${itemId}/sale_price?context=channel_marketplace`);
  if (sale) {
    const price = num(sale.amount) ?? num(sale.price) ?? num(sale.current_amount);
    if (price !== null) {
      return {
        price,
        originalPrice: num(sale.regular_amount) ?? num(sale.original_price),
        currency: text(sale.currency_id) || null,
        source: "sale_price",
      };
    }
  }

  const allPrices = await tryMl<{ prices?: Record<string, unknown>[] }>(env, `/items/${itemId}/prices`);
  const prices = allPrices?.prices || [];
  const eligible = prices.filter((entry) => {
    const conditions = object(entry.conditions);
    const contexts = Array.isArray(conditions?.context_restrictions) ? conditions?.context_restrictions : [];
    return contexts.length === 0 || contexts.includes("channel_marketplace");
  });
  const promotion = eligible.find((entry) => text(entry.type) === "promotion");
  const standard = eligible.find((entry) => text(entry.type) === "standard");
  const selected = promotion || standard;
  if (selected) {
    const amount = num(selected.amount);
    return {
      price: amount,
      originalPrice: num(selected.regular_amount) ?? (promotion ? num(standard?.amount) : null),
      currency: text(selected.currency_id) || null,
      source: "prices",
    };
  }

  return { price: null, originalPrice: null, currency: null, source: "sin_precio" };
}

function collectChildProductIds(product: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const children = Array.isArray(product.children_ids) ? product.children_ids : [];
  for (const child of children) {
    const id = text(child);
    if (id) ids.add(id);
  }
  const pickers = Array.isArray(product.pickers) ? product.pickers : [];
  for (const pickerValue of pickers) {
    const picker = object(pickerValue);
    const products = Array.isArray(picker?.products) ? picker?.products : [];
    for (const productValue of products) {
      const id = text(object(productValue)?.product_id);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function parseReference(input: string): { itemId?: string; productId?: string } {
  let decoded = input;
  try {
    const outer = new URL(input);
    const nested = outer.searchParams.get("url");
    if (nested) decoded = decodeURIComponent(nested);
  } catch {
    try { decoded = decodeURIComponent(input); } catch { /* keep original */ }
  }
  const id = decoded.toUpperCase().match(/MLC\d+/)?.[0];
  if (!id) return {};
  return /\/P\/MLC\d+/i.test(decoded) ? { productId: id } : { itemId: id };
}

function cloneJsonRequest(request: Request, body: Record<string, unknown>): Request {
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  });
}

async function getToken(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT * FROM ml_connection WHERE id = 1").first<TokenRow>();
  if (!row) throw new Error("Mercado Libre no está conectado");
  if (row.expires_at > Date.now() + 300000) return decrypt(row.access_token, env.TOKEN_ENCRYPTION_KEY);

  const refreshToken = await decrypt(row.refresh_token, env.TOKEN_ENCRYPTION_KEY);
  const base = env.ML_API_BASE || "https://api.mercadolibre.com";
  const response = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.ML_CLIENT_ID,
      client_secret: env.ML_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  const payload = await response.json() as TokenResponse & { message?: string; error?: string };
  if (!response.ok) throw new Error(`No se pudo renovar OAuth (${response.status}): ${payload.message || payload.error || "error"}`);
  return payload.access_token;
}

async function mlFetch<T>(env: Env, path: string): Promise<T> {
  const token = await getToken(env);
  const response = await fetch(`${env.ML_API_BASE || "https://api.mercadolibre.com"}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const raw = await response.text();
  let payload: unknown;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { message: raw.slice(0, 400) }; }
  if (!response.ok) {
    const error = object(payload);
    throw new Error(`Mercado Libre API ${response.status} en ${path.split("?")[0]}: ${text(error?.message) || text(error?.error) || "acceso denegado"}`);
  }
  return payload as T;
}

async function tryMl<T>(env: Env, path: string): Promise<T | null> {
  try { return await mlFetch<T>(env, path); }
  catch (error) { console.warn(error); return null; }
}

async function mapLimit<T, R>(values: T[], concurrency: number, mapper: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function dedupeOffers(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = offer.itemId || offer.productId || offer.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortOffers(offers: Offer[], sort: string): void {
  if (sort !== "price_asc" && sort !== "price_desc") return;
  const direction = sort === "price_asc" ? 1 : -1;
  offers.sort((a, b) => ((a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)) * direction);
}

function normalizeOffer(offer: Offer): Record<string, unknown> {
  const discount = offer.price !== null && offer.originalPrice !== null && offer.originalPrice > offer.price
    ? Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 1000) / 10
    : null;
  return { ...offer, discountPercent: discount };
}

function similarity(left: string, right: string): number {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.max(a.size, b.size);
}

function tokens(value: string): string[] {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").split(" ").filter((token) => token.length > 1);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function clamp(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded);
  if (raw.byteLength !== 32) throw new Error("TOKEN_ENCRYPTION_KEY inválida");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(value: string, encodedKey: string): Promise<string> {
  const [iv, data] = value.split(".");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    await importKey(encodedKey),
    fromBase64Url(data),
  );
  return new TextDecoder().decode(decrypted);
}
function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
