import legacyWorker from "./index";

interface D1Result<T = unknown> { results?: T[]; }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
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
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  updated_at: number;
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
  rawProduct?: Record<string, unknown>;
}

const SITE_ID = "MLC";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && path === "/health") {
      return json({ ok: true, service: "ofertasflash-meli-connector", version: "2.1.0", searchMode: "products-search" });
    }

    if (path === "/api/search" || path === "/api/analyze") {
      const authError = authorize(request, env);
      if (authError) return authError;
      try {
        if (request.method === "GET" && path === "/api/search") return searchHandler(url, env);
        if (request.method === "POST" && path === "/api/analyze") return analyzeHandler(request, env);
        return json({ error: "method_not_allowed" }, 405);
      } catch (error) {
        console.error(error);
        return json({
          error: "mercadolibre_connector_error",
          message: error instanceof Error ? error.message : "Error inesperado",
        }, 500);
      }
    }

    return legacyWorker.fetch(request, env as never);
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
  const offers = await searchCatalog(q, limit, offset, env);
  sortOffers(offers, sort);
  return json({
    query: q,
    source: "Mercado Libre /products/search + buy_box_winner",
    paging: { limit, offset, returned: offers.length },
    results: offers.map(normalizeOffer),
    note: "La búsqueda general usa productos de catálogo y su publicación ganadora actual; Mercado Libre restringió el antiguo buscador genérico de /sites/MLC/search.",
  });
}

async function searchCatalog(query: string, limit: number, offset: number, env: Env): Promise<Offer[]> {
  const params = new URLSearchParams({
    status: "active",
    site_id: SITE_ID,
    q: query,
    limit: String(limit),
    offset: String(offset),
  });
  const search = await mlFetch<{ results?: Record<string, unknown>[] }>(env, `/products/search?${params}`);
  const stubs = search.results || [];
  const products = await Promise.all(stubs.map(async (stub) => {
    const id = text(stub.id);
    return id ? (await tryMl<Record<string, unknown>>(env, `/products/${id}`)) || stub : stub;
  }));
  return products.map(productToOffer).filter((offer) => offer.productId || offer.itemId);
}

function productToOffer(product: Record<string, unknown>): Offer {
  const winner = object(product.buy_box_winner);
  const pictures = Array.isArray(product.pictures) ? product.pictures : [];
  const firstPicture = pictures.map(object).find(Boolean);
  const seller = object(winner?.seller);
  return {
    itemId: text(winner?.item_id) || text(winner?.id) || null,
    productId: text(product.id) || null,
    title: text(product.name) || text(winner?.title) || "Producto sin título",
    price: num(winner?.price),
    originalPrice: num(winner?.original_price),
    currency: text(winner?.currency_id) || null,
    soldQuantity: num(winner?.sold_quantity) ?? num(product.sold_quantity),
    availableQuantity: num(winner?.available_quantity),
    sellerId: (winner?.seller_id as string | number | undefined) ?? (seller?.id as string | number | undefined) ?? null,
    officialStoreId: num(winner?.official_store_id),
    permalink: text(winner?.permalink) || text(product.permalink) || null,
    thumbnail: text(firstPicture?.url) || text(firstPicture?.secure_url) || null,
    shipping: object(winner?.shipping),
    rawProduct: product,
  };
}

async function analyzeHandler(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const inputUrl = text(body.url);
  const explicitItem = text(body.itemId)?.toUpperCase();
  const explicitProduct = text(body.productId)?.toUpperCase();
  const query = text(body.query);
  const parsed = inputUrl ? parseReference(inputUrl) : {};
  let itemId = explicitItem || parsed.itemId;
  let productId = explicitProduct || parsed.productId;
  let selectedOffer: Offer | null = null;

  if (!itemId && productId) {
    const product = await mlFetch<Record<string, unknown>>(env, `/products/${productId}`);
    selectedOffer = productToOffer(product);
    itemId = selectedOffer.itemId || undefined;
  }
  if (!itemId && query) {
    selectedOffer = (await searchCatalog(query, 10, 0, env)).find((offer) => offer.itemId) || null;
    itemId = selectedOffer?.itemId || undefined;
    productId = productId || selectedOffer?.productId || undefined;
  }
  if (!itemId) {
    return json({ error: "unresolved_offer", message: "No pude resolver una publicación comprable para esa referencia." }, 400);
  }

  const item = await mlFetch<Record<string, unknown>>(env, `/items/${itemId}?include_attributes=all`);
  productId = productId || text(item.catalog_product_id);
  const sellerId = item.seller_id as string | number | undefined;
  const seller = sellerId ? await tryMl<Record<string, unknown>>(env, `/users/${sellerId}`) : null;
  const comparables = await getComparables(text(item.title) || query || itemId, productId, itemId, env);
  const analysis = buildAnalysis(item, seller, comparables);

  if (body.saveSnapshot !== false) await saveSnapshot(env, item);

  return json({
    resolved: { itemId, productId: productId || null },
    item: normalizeItem(item),
    seller: seller ? normalizeSeller(seller) : null,
    comparableListings: comparables.map(normalizeOffer),
    analysis,
  });
}

async function getComparables(title: string, productId: string | undefined, excludeItemId: string, env: Env): Promise<Offer[]> {
  if (productId) {
    const exact = await tryMl<{ results?: Record<string, unknown>[] }>(env, `/products/${productId}/items`);
    const mapped = (exact?.results || []).map((entry) => ({
      itemId: text(entry.item_id) || text(entry.id) || null,
      productId,
      title: text(entry.title) || title,
      price: num(entry.price),
      originalPrice: num(entry.original_price),
      currency: text(entry.currency_id) || null,
      soldQuantity: num(entry.sold_quantity),
      availableQuantity: num(entry.available_quantity),
      sellerId: (entry.seller_id as string | number | undefined) || null,
      officialStoreId: num(entry.official_store_id),
      permalink: text(entry.permalink) || null,
      thumbnail: text(entry.thumbnail) || null,
      shipping: object(entry.shipping),
    } as Offer)).filter((offer) => offer.itemId !== excludeItemId && offer.price !== null);
    if (mapped.length) return mapped.slice(0, 15);
  }
  return (await searchCatalog(title, 15, 0, env))
    .filter((offer) => offer.itemId !== excludeItemId && offer.price !== null)
    .slice(0, 15);
}

function buildAnalysis(item: Record<string, unknown>, seller: Record<string, unknown> | null, comparables: Offer[]) {
  const price = num(item.price);
  const originalPrice = num(item.original_price);
  const prices = comparables.map((offer) => offer.price).filter((value): value is number => value !== null && value > 0);
  const medianPrice = median(prices);
  const displayedDiscount = price !== null && originalPrice !== null && originalPrice > price
    ? pct(originalPrice - price, originalPrice) : null;
  const marketDiscount = price !== null && medianPrice !== null && medianPrice > price
    ? pct(medianPrice - price, medianPrice) : null;
  const trust = trustScore(item, seller);
  const strongest = Math.max(displayedDiscount || 0, marketDiscount || 0);
  const possiblePriceError = Boolean(marketDiscount !== null && marketDiscount >= 55 && prices.length >= 3);
  return {
    currency: text(item.currency_id) || "CLP",
    currentPrice: price,
    originalPrice,
    medianComparablePrice: medianPrice,
    comparableCount: prices.length,
    displayedDiscountPercent: displayedDiscount,
    marketDiscountPercent: marketDiscount,
    trust,
    highConfidenceDeal: strongest >= 40 && trust.score >= 60,
    possiblePriceError,
    verdict: possiblePriceError ? "posible_error_de_precio" : strongest >= 40 && trust.score >= 60 ? "oferta_fuerte" : strongest >= 25 ? "oferta_interesante" : "precio_normal_o_no_verificado",
    note: "Validación heurística: confirma variante, precio final, despacho y garantía antes de promocionar.",
  };
}

function trustScore(item: Record<string, unknown>, seller: Record<string, unknown> | null) {
  const reputation = object(seller?.seller_reputation);
  const transactions = object(reputation?.transactions);
  const ratings = object(transactions?.ratings);
  const level = text(reputation?.level_id) || null;
  const power = text(reputation?.power_seller_status) || null;
  const completed = num(transactions?.completed) || 0;
  const positive = num(ratings?.positive) || 0;
  const sold = num(item.sold_quantity) || 0;
  let score = 0;
  const signals: string[] = [];
  if (level === "5_green") { score += 30; signals.push("reputación verde máxima"); }
  else if (level === "4_light_green") score += 20;
  if (power === "platinum") { score += 20; signals.push("MercadoLíder Platinum"); }
  else if (power === "gold") score += 15;
  if (completed >= 10000) score += 20; else if (completed >= 1000) score += 15; else if (completed >= 100) score += 10;
  if (positive >= 0.97) score += 12; else if (positive >= 0.9) score += 7;
  if (item.official_store_id) { score += 10; signals.push("tienda oficial"); }
  if (sold >= 1000) score += 8; else if (sold >= 100) score += 5;
  score = Math.min(100, score);
  return { score, label: score >= 80 ? "muy_confiable" : score >= 60 ? "confiable" : score >= 40 ? "revisar" : "datos_insuficientes", level, power, completedTransactions: completed, positiveRating: positive, soldQuantity: sold, signals };
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
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET, refresh_token: refreshToken }),
  });
  const payload = await response.json() as TokenResponse & { message?: string; error?: string };
  if (!response.ok) throw new Error(`No se pudo renovar OAuth (${response.status}): ${payload.message || payload.error || "error"}`);
  await saveToken(env, payload);
  return payload.access_token;
}

async function saveToken(env: Env, token: TokenResponse): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO ml_connection (id,user_id,access_token,refresh_token,expires_at,scope,updated_at)
     VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,scope=excluded.scope,updated_at=excluded.updated_at`,
  ).bind(String(token.user_id), await encrypt(token.access_token, env.TOKEN_ENCRYPTION_KEY), await encrypt(token.refresh_token, env.TOKEN_ENCRYPTION_KEY), now + token.expires_in * 1000, token.scope || null, now).run();
}

async function mlFetch<T>(env: Env, path: string): Promise<T> {
  const token = await getToken(env);
  const response = await fetch(`${env.ML_API_BASE || "https://api.mercadolibre.com"}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const textBody = await response.text();
  let payload: unknown;
  try { payload = textBody ? JSON.parse(textBody) : {}; } catch { payload = { message: textBody.slice(0, 400) }; }
  if (!response.ok) {
    const objectPayload = object(payload);
    throw new Error(`Mercado Libre API ${response.status} en ${path.split("?")[0]}: ${text(objectPayload?.message) || text(objectPayload?.error) || "forbidden"}`);
  }
  return payload as T;
}

async function tryMl<T>(env: Env, path: string): Promise<T | null> {
  try { return await mlFetch<T>(env, path); } catch (error) { console.warn(error); return null; }
}

async function saveSnapshot(env: Env, item: Record<string, unknown>): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO price_snapshots (resource_id,resource_type,title,price,original_price,currency_id,seller_id,captured_at,raw_json) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(text(item.id), "item", text(item.title), num(item.price), num(item.original_price), text(item.currency_id), String(item.seller_id || ""), Date.now(), JSON.stringify(item)).run();
}

function normalizeOffer(offer: Offer) {
  const discount = offer.price !== null && offer.originalPrice !== null && offer.originalPrice > offer.price ? pct(offer.originalPrice - offer.price, offer.originalPrice) : null;
  return { ...offer, discountPercent: discount, rawProduct: undefined };
}
function normalizeItem(item: Record<string, unknown>) {
  return { id: item.id, title: item.title, price: item.price, originalPrice: item.original_price ?? null, currency: item.currency_id, sellerId: item.seller_id, categoryId: item.category_id, catalogProductId: item.catalog_product_id ?? null, officialStoreId: item.official_store_id ?? null, availableQuantity: item.available_quantity, soldQuantity: item.sold_quantity, condition: item.condition, permalink: item.permalink, pictures: item.pictures, attributes: item.attributes, shipping: item.shipping, warranty: item.warranty };
}
function normalizeSeller(seller: Record<string, unknown>) {
  return { id: seller.id, nickname: seller.nickname, registrationDate: seller.registration_date, tags: seller.tags, permalink: seller.permalink, sellerReputation: seller.seller_reputation, status: seller.status };
}
function parseReference(input: string): { itemId?: string; productId?: string } {
  let decoded = input;
  try { const outer = new URL(input); const nested = outer.searchParams.get("url"); if (nested) decoded = decodeURIComponent(nested); } catch { try { decoded = decodeURIComponent(input); } catch { /* keep */ } }
  const id = decoded.toUpperCase().match(/MLC\d+/)?.[0];
  if (!id) return {};
  return /\/P\/MLC\d+/i.test(decoded) ? { productId: id } : { itemId: id };
}
function sortOffers(offers: Offer[], sort: string) {
  if (sort !== "price_asc" && sort !== "price_desc") return;
  const direction = sort === "price_asc" ? 1 : -1;
  offers.sort((a, b) => ((a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)) * direction);
}
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function clamp(value: string | null, min: number, max: number, fallback: number) { const parsed = Number.parseInt(value || "", 10); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }
function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2); }
function pct(part: number, total: number) { return Math.round((part / total) * 1000) / 10; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } }); }

async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded);
  if (raw.byteLength !== 32) throw new Error("TOKEN_ENCRYPTION_KEY inválida");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(encodedKey), new TextEncoder().encode(value));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}
async function decrypt(value: string, encodedKey: string): Promise<string> {
  const [iv, data] = value.split(".");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) }, await importKey(encodedKey), fromBase64Url(data));
  return new TextDecoder().decode(decrypted);
}
function toBase64Url(bytes: Uint8Array): string { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string): Uint8Array { const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
