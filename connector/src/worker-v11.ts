import workerV10 from "./worker-v10";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

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

interface Attempt {
  endpoint: string;
  authenticated: boolean;
  status: number;
  message: string | null;
}

interface ItemResolution {
  item: Record<string, unknown>;
  sourceEndpoint: string;
  authenticated: boolean;
  attempts: Attempt[];
}

interface PriceResolution {
  currentPrice: number | null;
  originalPrice: number | null;
  currency: string | null;
  source: string;
  attempts: Attempt[];
}

export default {
  async fetch(request: Request, env: Env, ctx?: unknown): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "11.0.0",
        searchMode: "web-discovery",
        validationMode: "plain-item-multiget-sale-price-fallbacks",
        browserSearchDisabled: true,
      });
    }

    if (request.method === "GET" && path.startsWith("/api/items/")) {
      const authError = authorize(request, env);
      if (authError) return authError;
      const itemId = path.slice("/api/items/".length).toUpperCase();
      return validateItem(itemId, url, env);
    }

    if (request.method === "POST" && path === "/api/analyze") {
      const authError = authorize(request, env);
      if (authError) return authError;
      return analyzeKnownOffer(request, env);
    }

    return workerV10.fetch(request, env as never, ctx as never);
  },
};

async function validateItem(itemId: string, url: URL, env: Env): Promise<Response> {
  if (!/^MLC\d{6,}$/.test(itemId)) {
    return json({ error: "invalid_item_id", message: "El ID debe tener formato MLC seguido de números." }, 400);
  }

  const resolution = await resolveItem(itemId, env);
  if (!resolution) {
    return json({
      error: "item_not_validated",
      message: "Mercado Libre no permitió validar esta publicación mediante ítem simple ni Multiget.",
      itemId,
    }, 502);
  }

  const price = await resolvePrice(itemId, resolution.item, env);
  const sellerId = scalar(resolution.item.seller_id);
  const seller = sellerId !== null ? await resolveSeller(String(sellerId), env) : null;
  const normalized = normalizeItem(resolution.item, price);

  if (url.searchParams.get("snapshot") === "true") {
    await saveSnapshot(env, normalized);
  }

  return json({
    validated: price.currentPrice !== null,
    validation: {
      itemSource: resolution.sourceEndpoint,
      itemRequestAuthenticated: resolution.authenticated,
      priceSource: price.source,
      verifiedAt: new Date().toISOString(),
      itemAttempts: resolution.attempts,
      priceAttempts: price.attempts,
    },
    item: normalized,
    seller,
    trust: seller ? trustScore(normalized, seller) : unavailableTrust(normalized),
  });
}

async function analyzeKnownOffer(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json", message: "Se esperaba un cuerpo JSON válido." }, 400);
  }

  const explicitItem = text(body.itemId)?.toUpperCase();
  const inputUrl = text(body.url);
  const parsedReference = inputUrl ? parseReference(inputUrl) : {};
  const itemId = explicitItem || parsedReference.itemId;

  if (!itemId) {
    return json({
      error: "item_id_required",
      message: "Esta validación requiere una URL de publicación o un itemId MLC. Usa búsqueda web para localizar candidatos antes de llamar al conector.",
    }, 400);
  }

  if (!/^MLC\d{6,}$/.test(itemId)) {
    return json({ error: "invalid_item_id", message: "El itemId no tiene un formato válido." }, 400);
  }

  const resolution = await resolveItem(itemId, env);
  if (!resolution) {
    return json({
      error: "item_not_validated",
      message: "La publicación no pudo validarse mediante los recursos oficiales de ítems.",
      resolved: { itemId },
    }, 502);
  }

  const price = await resolvePrice(itemId, resolution.item, env);
  if (price.currentPrice === null) {
    return json({
      error: "price_not_validated",
      message: "La publicación existe, pero Mercado Libre no entregó un precio verificable.",
      resolved: { itemId },
      validation: {
        itemSource: resolution.sourceEndpoint,
        itemAttempts: resolution.attempts,
        priceAttempts: price.attempts,
      },
    }, 502);
  }

  const item = normalizeItem(resolution.item, price);
  const sellerId = scalar(resolution.item.seller_id);
  const seller = sellerId !== null ? await resolveSeller(String(sellerId), env) : null;
  const trust = seller ? trustScore(item, seller) : unavailableTrust(item);
  const displayedDiscount = price.originalPrice !== null && price.originalPrice > price.currentPrice
    ? percentage(price.originalPrice - price.currentPrice, price.originalPrice)
    : null;

  if (body.saveSnapshot !== false) await saveSnapshot(env, item);

  return json({
    resolved: {
      itemId,
      productId: text(resolution.item.catalog_product_id) || parsedReference.productId || null,
    },
    item,
    seller,
    comparableListings: [],
    analysis: {
      currency: price.currency || text(resolution.item.currency_id) || "CLP",
      currentPrice: price.currentPrice,
      originalPrice: price.originalPrice,
      displayedDiscountPercent: displayedDiscount,
      medianComparablePrice: null,
      comparableCount: 0,
      marketDiscountPercent: null,
      trust,
      priceVerified: true,
      priceSource: price.source,
      itemSource: resolution.sourceEndpoint,
      highConfidenceDeal: null,
      possiblePriceError: null,
      verdict: "precio_validado_sin_comparables",
      verifiedAt: new Date().toISOString(),
      note: "El precio fue validado mediante recursos oficiales de ítems. No se calcularon comparables porque Mercado Libre ya no ofrece un buscador general de publicaciones mediante API.",
    },
    validation: {
      itemAttempts: resolution.attempts,
      priceAttempts: price.attempts,
    },
  });
}

async function resolveItem(itemId: string, env: Env): Promise<ItemResolution | null> {
  const attempts: Attempt[] = [];
  const token = await safeToken(env);
  const plans: Array<{ endpoint: string; authenticated: boolean; multiget: boolean }> = [
    { endpoint: `/items/${itemId}`, authenticated: true, multiget: false },
    { endpoint: `/items?ids=${encodeURIComponent(itemId)}`, authenticated: true, multiget: true },
    { endpoint: `/items/${itemId}`, authenticated: false, multiget: false },
    { endpoint: `/items?ids=${encodeURIComponent(itemId)}`, authenticated: false, multiget: true },
  ];

  for (const plan of plans) {
    if (plan.authenticated && !token) continue;
    const result = await mlRequest(env, plan.endpoint, plan.authenticated ? token : null);
    attempts.push({
      endpoint: plan.endpoint,
      authenticated: plan.authenticated,
      status: result.status,
      message: errorMessage(result.payload),
    });
    const item = plan.multiget ? extractMultigetItem(result.payload, itemId) : object(result.payload);
    if (result.status >= 200 && result.status < 300 && item && text(item.id)?.toUpperCase() === itemId) {
      return { item, sourceEndpoint: plan.endpoint, authenticated: plan.authenticated, attempts };
    }
  }
  return null;
}

async function resolvePrice(itemId: string, item: Record<string, unknown>, env: Env): Promise<PriceResolution> {
  const attempts: Attempt[] = [];
  const token = await safeToken(env);
  const plans: Array<{ endpoint: string; authenticated: boolean }> = [
    { endpoint: `/items/${itemId}/sale_price?context=channel_marketplace`, authenticated: true },
    { endpoint: `/items/${itemId}/prices`, authenticated: true },
    { endpoint: `/items/${itemId}/sale_price?context=channel_marketplace`, authenticated: false },
    { endpoint: `/items/${itemId}/prices`, authenticated: false },
  ];

  for (const plan of plans) {
    if (plan.authenticated && !token) continue;
    const result = await mlRequest(env, plan.endpoint, plan.authenticated ? token : null);
    attempts.push({ endpoint: plan.endpoint, authenticated: plan.authenticated, status: result.status, message: errorMessage(result.payload) });
    if (result.status < 200 || result.status >= 300) continue;
    const extracted = extractPricePayload(result.payload);
    if (extracted.currentPrice !== null) return { ...extracted, source: plan.endpoint, attempts };
  }

  const itemPrice = number(item.price) ?? number(item.base_price);
  const itemOriginal = number(item.original_price);
  return {
    currentPrice: itemPrice,
    originalPrice: itemOriginal !== null && itemPrice !== null && itemOriginal > itemPrice ? itemOriginal : null,
    currency: text(item.currency_id),
    source: itemPrice !== null ? "item.price" : "unavailable",
    attempts,
  };
}

function extractPricePayload(payload: unknown): Omit<PriceResolution, "source" | "attempts"> {
  const root = object(payload);
  if (!root) return { currentPrice: null, originalPrice: null, currency: null };

  const direct = number(root.amount) ?? number(root.current_amount) ?? number(root.price);
  if (direct !== null) {
    const original = number(root.regular_amount) ?? number(root.original_price);
    return {
      currentPrice: direct,
      originalPrice: original !== null && original > direct ? original : null,
      currency: text(root.currency_id),
    };
  }

  const prices = Array.isArray(root.prices) ? root.prices.filter(object) as Record<string, unknown>[] : [];
  const eligible = prices.filter((entry) => {
    const conditions = object(entry.conditions);
    const restrictions = Array.isArray(conditions?.context_restrictions) ? conditions?.context_restrictions : [];
    return restrictions.length === 0 || restrictions.includes("channel_marketplace");
  });
  const promotion = eligible.find((entry) => text(entry.type) === "promotion");
  const standard = eligible.find((entry) => text(entry.type) === "standard");
  const selected = promotion || standard;
  if (!selected) return { currentPrice: null, originalPrice: null, currency: null };
  const selectedAmount = number(selected.amount);
  const regular = number(selected.regular_amount) ?? (promotion ? number(standard?.amount) : null);
  return {
    currentPrice: selectedAmount,
    originalPrice: selectedAmount !== null && regular !== null && regular > selectedAmount ? regular : null,
    currency: text(selected.currency_id),
  };
}

async function resolveSeller(sellerId: string, env: Env): Promise<Record<string, unknown> | null> {
  const token = await safeToken(env);
  for (const credential of [token, null]) {
    if (credential === null && token === null) {
      // The anonymous attempt below is still useful when no OAuth token exists.
    }
    const result = await mlRequest(env, `/users/${encodeURIComponent(sellerId)}`, credential);
    const seller = object(result.payload);
    if (result.status >= 200 && result.status < 300 && seller) return normalizeSeller(seller);
  }
  return null;
}

async function mlRequest(env: Env, path: string, token: string | null): Promise<{ status: number; payload: unknown }> {
  const base = env.ML_API_BASE || "https://api.mercadolibre.com";
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${base}${path}`, { headers });
    const raw = await response.text();
    let payload: unknown = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { payload = { message: raw.slice(0, 500) }; }
    return { status: response.status, payload };
  } catch (error) {
    return { status: 599, payload: { message: error instanceof Error ? error.message : "network_error" } };
  }
}

async function safeToken(env: Env): Promise<string | null> {
  try { return await getToken(env); }
  catch { return null; }
}

async function getToken(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT * FROM ml_connection WHERE id = 1").first<TokenRow>();
  if (!row) throw new Error("Mercado Libre no está conectado");
  if (row.expires_at > Date.now() + 300_000) return decrypt(row.access_token, env.TOKEN_ENCRYPTION_KEY);

  const refreshToken = await decrypt(row.refresh_token, env.TOKEN_ENCRYPTION_KEY);
  const response = await fetch(`${env.ML_API_BASE || "https://api.mercadolibre.com"}/oauth/token`, {
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
  if (!response.ok) throw new Error(payload.message || payload.error || "No se pudo renovar OAuth");
  await saveToken(env, payload);
  return payload.access_token;
}

async function saveToken(env: Env, token: TokenResponse): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO ml_connection (id,user_id,access_token,refresh_token,expires_at,scope,updated_at)
     VALUES (1,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,access_token=excluded.access_token,
       refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,scope=excluded.scope,updated_at=excluded.updated_at`,
  ).bind(
    String(token.user_id),
    await encrypt(token.access_token, env.TOKEN_ENCRYPTION_KEY),
    await encrypt(token.refresh_token, env.TOKEN_ENCRYPTION_KEY),
    now + Math.max(60, token.expires_in || 10_800) * 1000,
    token.scope || null,
    now,
  ).run();
}

function extractMultigetItem(payload: unknown, itemId: string): Record<string, unknown> | null {
  if (!Array.isArray(payload)) return null;
  for (const entryValue of payload) {
    const entry = object(entryValue);
    if (!entry || number(entry.code) !== 200) continue;
    const body = object(entry.body);
    if (body && text(body.id)?.toUpperCase() === itemId) return body;
  }
  return null;
}

function normalizeItem(item: Record<string, unknown>, price: PriceResolution): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    price: price.currentPrice,
    basePrice: item.base_price ?? null,
    originalPrice: price.originalPrice,
    currency: price.currency || item.currency_id || "CLP",
    sellerId: item.seller_id,
    categoryId: item.category_id,
    catalogProductId: item.catalog_product_id ?? null,
    officialStoreId: item.official_store_id ?? null,
    availableQuantity: item.available_quantity,
    soldQuantity: item.sold_quantity,
    condition: item.condition,
    status: item.status,
    permalink: item.permalink,
    thumbnail: item.thumbnail,
    pictures: item.pictures,
    attributes: item.attributes,
    shipping: item.shipping,
    warranty: item.warranty,
  };
}

function normalizeSeller(seller: Record<string, unknown>): Record<string, unknown> {
  return {
    id: seller.id,
    nickname: seller.nickname,
    registrationDate: seller.registration_date,
    tags: seller.tags,
    permalink: seller.permalink,
    sellerReputation: seller.seller_reputation,
    status: seller.status,
  };
}

function trustScore(item: Record<string, unknown>, seller: Record<string, unknown>): Record<string, unknown> {
  const reputation = object(seller.sellerReputation) || object(seller.seller_reputation);
  const transactions = object(reputation?.transactions);
  const ratings = object(transactions?.ratings);
  const level = text(reputation?.level_id);
  const power = text(reputation?.power_seller_status);
  const completed = number(transactions?.completed) || 0;
  const positive = number(ratings?.positive) || 0;
  const sold = number(item.soldQuantity) || number(item.sold_quantity) || 0;
  let score = 0;
  const signals: string[] = [];
  if (level === "5_green") { score += 30; signals.push("reputación verde máxima"); }
  else if (level === "4_light_green") score += 20;
  if (power === "platinum") { score += 20; signals.push("MercadoLíder Platinum"); }
  else if (power === "gold") score += 15;
  if (completed >= 10_000) score += 20; else if (completed >= 1_000) score += 15; else if (completed >= 100) score += 10;
  if (positive >= 0.97) score += 12; else if (positive >= 0.9) score += 7;
  if (item.officialStoreId || item.official_store_id) { score += 10; signals.push("tienda oficial"); }
  if (sold >= 1_000) score += 8; else if (sold >= 100) score += 5;
  score = Math.min(100, score);
  return {
    score,
    label: score >= 80 ? "muy_confiable" : score >= 60 ? "confiable" : score >= 40 ? "revisar" : "datos_insuficientes",
    reputationLevel: level || null,
    powerSellerStatus: power || null,
    completedTransactions: completed,
    positiveRating: positive,
    soldQuantity: sold,
    signals,
  };
}

function unavailableTrust(item: Record<string, unknown>): Record<string, unknown> {
  return {
    score: null,
    label: "vendedor_no_disponible",
    soldQuantity: number(item.soldQuantity) || 0,
    signals: [],
  };
}

async function saveSnapshot(env: Env, item: Record<string, unknown>): Promise<void> {
  const id = text(item.id);
  if (!id) return;
  await env.DB.prepare(
    `INSERT INTO price_snapshots
      (resource_id,resource_type,title,price,original_price,currency_id,seller_id,captured_at,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id,
    "item",
    text(item.title) || id,
    number(item.price),
    number(item.originalPrice),
    text(item.currency),
    scalar(item.sellerId) !== null ? String(scalar(item.sellerId)) : null,
    Date.now(),
    JSON.stringify(item),
  ).run();
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
  const itemPath = decoded.match(/\/MLC-(\d{6,})-/i);
  if (itemPath) return { itemId: `MLC${itemPath[1]}` };
  const id = decoded.toUpperCase().match(/MLC\d{6,}/)?.[0];
  if (!id) return {};
  return /\/P\/MLC\d+/i.test(decoded) ? { productId: id } : { itemId: id };
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

function errorMessage(payload: unknown): string | null {
  const root = object(payload);
  if (!root) return null;
  return text(root.message) || text(root.error) || null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scalar(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function percentage(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
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
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(encodedKey),
    new TextEncoder().encode(value),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string, encodedKey: string): Promise<string> {
  const [iv, data] = value.split(".");
  if (!iv || !data) throw new Error("Token cifrado inválido");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    await importKey(encodedKey),
    fromBase64Url(data),
  );
  return new TextDecoder().decode(decrypted);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
