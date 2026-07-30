interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface Env {
  DB: D1Database;
  ML_CLIENT_ID: string;
  ML_CLIENT_SECRET: string;
  ML_REDIRECT_URI: string;
  ML_AUTH_URL?: string;
  ML_API_BASE?: string;
  TOKEN_ENCRYPTION_KEY: string;
  CONNECTOR_API_KEY: string;
  PUBLIC_BASE_URL: string;
}

interface TokenRow {
  id: number;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  updated_at: number;
}

interface MercadoLibreTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number | string;
  refresh_token: string;
}

interface SearchResult {
  id?: string;
  title?: string;
  price?: number;
  original_price?: number | null;
  currency_id?: string;
  available_quantity?: number;
  sold_quantity?: number;
  condition?: string;
  permalink?: string;
  thumbnail?: string;
  seller?: {
    id?: number | string;
    nickname?: string;
    car_dealer?: boolean;
    real_estate_agency?: boolean;
    registration_date?: string;
    tags?: string[];
    seller_reputation?: SellerReputation;
  };
  shipping?: Record<string, unknown>;
  official_store_id?: number | null;
  catalog_product_id?: string | null;
  category_id?: string;
}

interface TrustScore {
  score: number;
  label: string;
  reputationLevel: string | null;
  powerSellerStatus: string | null;
  completedTransactions: number;
  positiveRating: number;
  soldQuantity: number;
  officialStore: boolean;
  signals: string[];
}

interface SellerReputation {
  level_id?: string | null;
  power_seller_status?: string | null;
  transactions?: {
    total?: number;
    completed?: number;
    canceled?: number;
    ratings?: {
      positive?: number;
      neutral?: number;
      negative?: number;
    };
  };
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const ML_SITE_ID = "MLC";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json(
        {
          error: "internal_error",
          message: error instanceof Error ? error.message : "Error inesperado",
        },
        500,
      );
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method === "GET" && path === "/") return html(homePage(env));
  if (request.method === "GET" && path === "/health") {
    return json({ ok: true, service: "ofertasflash-meli-connector", site: ML_SITE_ID });
  }
  if (request.method === "GET" && path === "/privacy") return html(privacyPage());
  if (request.method === "GET" && path === "/openapi.json") return json(openApiSchema(env));
  if (request.method === "GET" && path === "/connect") return startOAuth(env);
  if (request.method === "GET" && path === "/oauth/callback") return finishOAuth(url, env);

  const authError = authorizeConnector(request, env);
  if (authError) return authError;

  if (request.method === "GET" && path === "/api/status") return connectionStatus(env);
  if (request.method === "POST" && path === "/api/disconnect") {
    await env.DB.prepare("DELETE FROM ml_connection WHERE id = 1").run();
    return json({ connected: false, message: "Cuenta desconectada" });
  }
  if (request.method === "GET" && path === "/api/me") {
    const data = await mlFetch<Record<string, unknown>>(env, "/users/me");
    return json(data);
  }
  if (request.method === "GET" && path === "/api/search") return searchOffers(url, env);
  if (request.method === "GET" && path.startsWith("/api/items/")) {
    const id = path.slice("/api/items/".length).toUpperCase();
    return itemDetails(id, url, env);
  }
  if (request.method === "GET" && path.startsWith("/api/products/")) {
    const id = path.slice("/api/products/".length).toUpperCase();
    return productDetails(id, env);
  }
  if (request.method === "POST" && path === "/api/analyze") return analyzeOffer(request, env);
  if (request.method === "POST" && path === "/api/snapshot") return createSnapshot(request, env);
  if (request.method === "GET" && path.startsWith("/api/history/")) {
    const id = path.slice("/api/history/".length).toUpperCase();
    return priceHistory(id, env);
  }

  return json({ error: "not_found", message: "Ruta no encontrada" }, 404);
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders() },
  });
}

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-connector-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function authorizeConnector(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const custom = request.headers.get("x-connector-key")?.trim() ?? "";
  const supplied = bearer || custom;
  if (!env.CONNECTOR_API_KEY || !supplied || supplied !== env.CONNECTOR_API_KEY) {
    return json({ error: "unauthorized", message: "Falta una clave válida del conector" }, 401);
  }
  return null;
}

async function startOAuth(env: Env): Promise<Response> {
  assertEnv(env, ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI"]);
  const state = randomToken(32);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO oauth_states (state, expires_at) VALUES (?, ?) ON CONFLICT(state) DO UPDATE SET expires_at = excluded.expires_at",
  ).bind(state, expiresAt).run();
  await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(Date.now()).run();

  const authUrl = new URL(env.ML_AUTH_URL || "https://auth.mercadolibre.cl/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.ML_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.ML_REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
}

async function finishOAuth(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return html(resultPage("Autorización cancelada", `Mercado Libre respondió: ${escapeHtml(oauthError)}`, false), 400);
  }
  if (!code || !state) {
    return html(resultPage("Faltan datos", "No se recibió el código o el estado de autorización.", false), 400);
  }

  const stateRow = await env.DB.prepare("SELECT state, expires_at FROM oauth_states WHERE state = ?")
    .bind(state)
    .first<{ state: string; expires_at: number }>();
  if (!stateRow || stateRow.expires_at < Date.now()) {
    return html(resultPage("Solicitud inválida", "El enlace venció o el parámetro state no coincide.", false), 400);
  }
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();

  const token = await exchangeToken(env, {
    grant_type: "authorization_code",
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    code,
    redirect_uri: env.ML_REDIRECT_URI,
  });
  await saveConnection(env, token);
  return html(resultPage(
    "Mercado Libre conectado",
    "La autorización se guardó cifrada. Ya puedes cerrar esta pestaña y configurar la acción de ChatGPT.",
    true,
  ));
}

async function exchangeToken(env: Env, params: Record<string, string>): Promise<MercadoLibreTokenResponse> {
  const base = env.ML_API_BASE || "https://api.mercadolibre.com";
  const response = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const payload = await parseJson(response);
  if (!response.ok) throw new Error(`Mercado Libre rechazó el token (${response.status}): ${safeMessage(payload)}`);
  return payload as MercadoLibreTokenResponse;
}

async function saveConnection(env: Env, token: MercadoLibreTokenResponse): Promise<void> {
  const now = Date.now();
  const expiresAt = now + Math.max(60, Number(token.expires_in || 10_800)) * 1000;
  const accessToken = await encryptText(token.access_token, env.TOKEN_ENCRYPTION_KEY);
  const refreshToken = await encryptText(token.refresh_token, env.TOKEN_ENCRYPTION_KEY);
  await env.DB.prepare(
    `INSERT INTO ml_connection (id, user_id, access_token, refresh_token, expires_at, scope, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, access_token = excluded.access_token,
     refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
     scope = excluded.scope, updated_at = excluded.updated_at`,
  ).bind(String(token.user_id), accessToken, refreshToken, expiresAt, token.scope ?? null, now).run();
}

async function getConnection(env: Env): Promise<TokenRow | null> {
  return env.DB.prepare("SELECT * FROM ml_connection WHERE id = 1").first<TokenRow>();
}

async function getValidAccessToken(env: Env): Promise<string> {
  const row = await getConnection(env);
  if (!row) throw new Error("Mercado Libre aún no está conectado. Abre /connect primero.");
  if (row.expires_at > Date.now() + 5 * 60 * 1000) {
    return decryptText(row.access_token, env.TOKEN_ENCRYPTION_KEY);
  }
  const refreshToken = await decryptText(row.refresh_token, env.TOKEN_ENCRYPTION_KEY);
  const refreshed = await exchangeToken(env, {
    grant_type: "refresh_token",
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  await saveConnection(env, refreshed);
  return refreshed.access_token;
}

async function mlFetch<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getValidAccessToken(env);
  const base = env.ML_API_BASE || "https://api.mercadolibre.com";
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  const payload = await parseJson(response);
  if (!response.ok) throw new Error(`Mercado Libre API ${response.status}: ${safeMessage(payload)}`);
  return payload as T;
}

async function connectionStatus(env: Env): Promise<Response> {
  const row = await getConnection(env);
  if (!row) return json({ connected: false });
  return json({
    connected: true,
    userId: row.user_id,
    scope: row.scope,
    tokenExpiresAt: new Date(row.expires_at).toISOString(),
    tokenNeedsRefresh: row.expires_at <= Date.now() + 5 * 60 * 1000,
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

async function searchOffers(url: URL, env: Env): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "invalid_query", message: "El parámetro q es obligatorio" }, 400);
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 20);
  const offset = clampInt(url.searchParams.get("offset"), 0, 1000, 0);
  const sort = (url.searchParams.get("sort") || "relevance").trim();
  const allowedSorts = new Set(["relevance", "price_asc", "price_desc"]);
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
  if (allowedSorts.has(sort) && sort !== "relevance") params.set("sort", sort);
  const data = await mlFetch<{ paging?: Record<string, unknown>; results?: SearchResult[] }>(
    env,
    `/sites/${ML_SITE_ID}/search?${params.toString()}`,
  );
  return json({ query: q, paging: data.paging ?? {}, results: (data.results ?? []).map(normalizeSearchResult) });
}

async function itemDetails(id: string, url: URL, env: Env): Promise<Response> {
  if (!/^MLC\d+$/.test(id)) return json({ error: "invalid_item_id", message: "ID de ítem inválido" }, 400);
  const item = await mlFetch<Record<string, unknown>>(env, `/items/${id}?include_attributes=all`);
  const sellerId = item.seller_id as string | number | undefined;
  const seller = sellerId ? await mlFetch<Record<string, unknown>>(env, `/users/${sellerId}`) : null;
  if (url.searchParams.get("snapshot") === "true") await storeSnapshot(env, item, "item");
  return json({ item, seller, trust: scoreSellerTrust(item, seller) });
}

async function productDetails(id: string, env: Env): Promise<Response> {
  if (!/^MLC\d+$/.test(id)) return json({ error: "invalid_product_id", message: "ID de producto inválido" }, 400);
  const product = await mlFetch<Record<string, unknown>>(env, `/products/${id}`);
  return json({ product });
}

async function analyzeOffer(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const inputUrl = stringValue(body.url);
  const explicitItemId = stringValue(body.itemId)?.toUpperCase();
  const explicitProductId = stringValue(body.productId)?.toUpperCase();
  const query = stringValue(body.query);
  const parsed = inputUrl ? parseMercadoLibreReference(inputUrl) : null;
  let itemId = explicitItemId || parsed?.itemId;
  let productId = explicitProductId || parsed?.productId;

  if (!itemId && productId) {
    const product = await mlFetch<Record<string, unknown>>(env, `/products/${productId}`);
    itemId = extractBuyBoxItemId(product);
    if (!itemId) {
      const shortDescription = product.short_description as Record<string, unknown> | undefined;
      const productTitle = stringValue(product.name) || stringValue(shortDescription?.content);
      if (productTitle) itemId = await resolveFirstItemFromQuery(productTitle, env);
    }
  }
  if (!itemId && query) itemId = await resolveFirstItemFromQuery(query, env);
  if (!itemId) {
    return json({
      error: "unresolved_offer",
      message: "No pude resolver un item_id. Envía itemId, productId, una URL de Mercado Libre o una búsqueda.",
    }, 400);
  }

  const item = await mlFetch<Record<string, unknown>>(env, `/items/${itemId}?include_attributes=all`);
  productId = productId || stringValue(item.catalog_product_id);
  const sellerId = item.seller_id as string | number | undefined;
  const seller = sellerId ? await mlFetch<Record<string, unknown>>(env, `/users/${sellerId}`) : null;
  const title = stringValue(item.title) || query || itemId;
  const comparables = await findComparables(title, productId, itemId, env);
  const analysis = buildOfferAnalysis(item, seller, comparables, productId);
  if (body.saveSnapshot !== false) await storeSnapshot(env, item, "item");
  return json({
    resolved: { itemId, productId: productId || null },
    item: normalizeItem(item),
    seller: normalizeSeller(seller),
    comparableListings: comparables.map(normalizeSearchResult),
    analysis,
  });
}

async function resolveFirstItemFromQuery(query: string, env: Env): Promise<string | undefined> {
  const params = new URLSearchParams({ q: query, limit: "10" });
  const data = await mlFetch<{ results?: SearchResult[] }>(env, `/sites/${ML_SITE_ID}/search?${params.toString()}`);
  return data.results?.find((result) => result.id && /^MLC\d+$/.test(result.id))?.id;
}

function extractBuyBoxItemId(product: Record<string, unknown>): string | undefined {
  const winner = product.buy_box_winner;
  if (winner && typeof winner === "object") {
    const object = winner as Record<string, unknown>;
    const candidate = stringValue(object.item_id) || stringValue(object.id);
    if (candidate && /^MLC\d+$/.test(candidate)) return candidate;
  }
  const direct = stringValue(product.buy_box_winner_id);
  return direct && /^MLC\d+$/.test(direct) ? direct : undefined;
}

async function findComparables(
  title: string,
  productId: string | undefined,
  excludeItemId: string,
  env: Env,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: title, limit: "30" });
  const data = await mlFetch<{ results?: SearchResult[] }>(env, `/sites/${ML_SITE_ID}/search?${params.toString()}`);
  const candidates = (data.results ?? []).filter((result) => result.id !== excludeItemId && typeof result.price === "number");
  const sameProduct = productId ? candidates.filter((result) => result.catalog_product_id === productId) : [];
  const base = sameProduct.length >= 3
    ? sameProduct
    : candidates.filter((result) => titleSimilarity(title, result.title || "") >= 0.45);
  return base.slice(0, 15);
}

function buildOfferAnalysis(
  item: Record<string, unknown>,
  seller: Record<string, unknown> | null,
  comparables: SearchResult[],
  productId?: string,
): Record<string, unknown> {
  const price = numberValue(item.price);
  const originalPrice = numberValue(item.original_price);
  const comparablePrices = comparables
    .map((result) => result.price)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const medianMarketPrice = median(comparablePrices);
  const displayedDiscount = price && originalPrice && originalPrice > price
    ? percentage(originalPrice - price, originalPrice)
    : null;
  const marketDiscount = price && medianMarketPrice && medianMarketPrice > price
    ? percentage(medianMarketPrice - price, medianMarketPrice)
    : null;
  const trust = scoreSellerTrust(item, seller);
  const strongestDiscount = Math.max(displayedDiscount || 0, marketDiscount || 0);
  const possiblePriceError = Boolean(
    price && medianMarketPrice && marketDiscount && marketDiscount >= 55 && comparablePrices.length >= 3,
  );
  const highConfidenceDeal = strongestDiscount >= 40 && trust.score >= 60;
  const reasons: string[] = [];
  const risks: string[] = [];
  if (displayedDiscount !== null) reasons.push(`Descuento publicado aproximado de ${displayedDiscount}%`);
  if (marketDiscount !== null) reasons.push(`Precio aproximadamente ${marketDiscount}% bajo la mediana comparable`);
  if (trust.score >= 75) reasons.push("Vendedor con señales fuertes de confianza");
  if ((numberValue(item.sold_quantity) ?? 0) >= 500) reasons.push("La publicación registra un volumen alto de ventas");
  if (comparablePrices.length < 3) risks.push("Hay pocos comparables para validar el precio de mercado");
  if (trust.score < 50) risks.push("La reputación o el historial del vendedor requieren revisión manual");
  if (!originalPrice) risks.push("Mercado Libre no informa un precio anterior verificable en la API");
  if (possiblePriceError) risks.push("Un precio anormalmente bajo puede ser un error, una variante distinta o una condición especial");

  return {
    productId: productId || null,
    currency: stringValue(item.currency_id) || "CLP",
    currentPrice: price,
    originalPrice,
    medianComparablePrice: medianMarketPrice,
    comparableCount: comparablePrices.length,
    displayedDiscountPercent: displayedDiscount,
    marketDiscountPercent: marketDiscount,
    trust,
    highConfidenceDeal,
    possiblePriceError,
    verdict: possiblePriceError
      ? "posible_error_de_precio"
      : highConfidenceDeal
        ? "oferta_fuerte"
        : strongestDiscount >= 25
          ? "oferta_interesante"
          : "precio_normal_o_no_verificado",
    reasons,
    risks,
    note: "El análisis es heurístico. Verifica variante, vendedor, despacho, garantía y precio final antes de promocionar.",
  };
}

function scoreSellerTrust(item: Record<string, unknown>, seller: Record<string, unknown> | null): TrustScore {
  const reputation = seller?.seller_reputation as SellerReputation | undefined;
  const level = reputation?.level_id || null;
  const power = reputation?.power_seller_status || null;
  const transactions = reputation?.transactions;
  const completed = transactions?.completed || 0;
  const positive = transactions?.ratings?.positive || 0;
  const soldQuantity = numberValue(item.sold_quantity) || 0;
  const officialStore = Boolean(item.official_store_id);
  let score = 0;
  const signals: string[] = [];

  if (level === "5_green") { score += 25; signals.push("reputación verde máxima"); }
  else if (level === "4_light_green") { score += 18; signals.push("reputación verde"); }
  else if (level === "3_yellow") { score += 8; signals.push("reputación amarilla"); }

  if (power === "platinum") { score += 20; signals.push("MercadoLíder Platinum"); }
  else if (power === "gold") { score += 16; signals.push("MercadoLíder Gold"); }
  else if (power === "silver") { score += 12; signals.push("MercadoLíder Silver"); }

  if (completed >= 10_000) score += 20;
  else if (completed >= 1_000) score += 15;
  else if (completed >= 100) score += 10;
  else if (completed >= 20) score += 5;

  if (positive >= 0.97) score += 12;
  else if (positive >= 0.93) score += 8;
  else if (positive >= 0.85) score += 3;

  if (officialStore) { score += 10; signals.push("tienda oficial"); }
  if (soldQuantity >= 1_000) score += 8;
  else if (soldQuantity >= 100) score += 5;
  else if (soldQuantity >= 20) score += 2;
  if (stringValue(item.condition) === "new") score += 5;
  score = Math.min(100, score);

  return {
    score,
    label: score >= 80 ? "muy_confiable" : score >= 60 ? "confiable" : score >= 40 ? "revisar" : "riesgo_alto",
    reputationLevel: level,
    powerSellerStatus: power,
    completedTransactions: completed,
    positiveRating: positive,
    soldQuantity,
    officialStore,
    signals,
  };
}

async function createSnapshot(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const itemId = stringValue(body.itemId)?.toUpperCase();
  if (!itemId || !/^MLC\d+$/.test(itemId)) {
    return json({ error: "invalid_item_id", message: "itemId es obligatorio" }, 400);
  }
  const item = await mlFetch<Record<string, unknown>>(env, `/items/${itemId}`);
  await storeSnapshot(env, item, "item");
  return json({ saved: true, itemId, capturedAt: new Date().toISOString() });
}

async function storeSnapshot(env: Env, resource: Record<string, unknown>, type: string): Promise<void> {
  const id = stringValue(resource.id);
  if (!id) return;
  await env.DB.prepare(
    `INSERT INTO price_snapshots
      (resource_id, resource_type, title, price, original_price, currency_id, seller_id, captured_at, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    type,
    stringValue(resource.title) || stringValue(resource.name) || id,
    numberValue(resource.price),
    numberValue(resource.original_price),
    stringValue(resource.currency_id),
    stringValue(resource.seller_id),
    Date.now(),
    JSON.stringify(resource),
  ).run();
}

async function priceHistory(id: string, env: Env): Promise<Response> {
  if (!/^MLC\d+$/.test(id)) return json({ error: "invalid_resource_id" }, 400);
  const result = await env.DB.prepare(
    `SELECT resource_id, resource_type, title, price, original_price, currency_id, seller_id, captured_at
     FROM price_snapshots WHERE resource_id = ? ORDER BY captured_at DESC LIMIT 200`,
  ).bind(id).all<Record<string, unknown>>();
  return json({ resourceId: id, history: result.results ?? [] });
}

function normalizeSearchResult(result: SearchResult): Record<string, unknown> {
  const discount = result.price && result.original_price && result.original_price > result.price
    ? percentage(result.original_price - result.price, result.original_price)
    : null;
  return {
    id: result.id,
    title: result.title,
    price: result.price,
    originalPrice: result.original_price ?? null,
    discountPercent: discount,
    currency: result.currency_id,
    soldQuantity: result.sold_quantity,
    availableQuantity: result.available_quantity,
    condition: result.condition,
    permalink: result.permalink,
    thumbnail: result.thumbnail,
    shipping: result.shipping,
    officialStoreId: result.official_store_id ?? null,
    sellerId: result.seller?.id,
    sellerNickname: result.seller?.nickname,
    sellerReputation: result.seller?.seller_reputation ?? null,
    catalogProductId: result.catalog_product_id ?? null,
    categoryId: result.category_id,
  };
}

function normalizeItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    price: item.price,
    originalPrice: item.original_price ?? null,
    currency: item.currency_id,
    sellerId: item.seller_id,
    categoryId: item.category_id,
    catalogProductId: item.catalog_product_id ?? null,
    officialStoreId: item.official_store_id ?? null,
    availableQuantity: item.available_quantity,
    soldQuantity: item.sold_quantity,
    condition: item.condition,
    permalink: item.permalink,
    pictures: item.pictures,
    attributes: item.attributes,
    shipping: item.shipping,
    warranty: item.warranty,
  };
}

function normalizeSeller(seller: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!seller) return null;
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

function parseMercadoLibreReference(input: string): { itemId?: string; productId?: string } {
  let decoded = input;
  try {
    const outer = new URL(input);
    const nested = outer.searchParams.get("url");
    if (nested) decoded = decodeURIComponent(nested);
  } catch {
    try { decoded = decodeURIComponent(input); } catch { decoded = input; }
  }
  const upper = decoded.toUpperCase();
  const id = upper.match(/MLC\d+/)?.[0];
  if (!id) return {};
  if (/\/P\/MLC\d+/i.test(decoded) || /PRODUCT/i.test(decoded)) return { productId: id };
  return { itemId: id };
}

function titleSimilarity(left: string, right: string): number {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.max(a.size, b.size);
}

function tokenize(value: string): string[] {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((token) => token.length >= 2 && !["de", "la", "el", "en", "con", "para", "por"].includes(token));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentage(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readBody(request: Request): Promise<Record<string, any>> {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Se esperaba application/json");
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("El cuerpo JSON debe ser un objeto");
  return body as Record<string, any>;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 500) }; }
}

function safeMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload);
  const object = payload as Record<string, unknown>;
  return stringValue(object.message) || stringValue(object.error) || JSON.stringify(object).slice(0, 500);
}

function assertEnv(env: Env, keys: Array<keyof Env>): void {
  for (const key of keys) if (!env[key]) throw new Error(`Falta configurar ${String(key)}`);
}

function randomToken(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

async function encryptText(plaintext: string, base64Key: string): Promise<string> {
  const key = await importEncryptionKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptText(payload: string, base64Key: string): Promise<string> {
  const [ivPart, dataPart] = payload.split(".");
  if (!ivPart || !dataPart) throw new Error("Token cifrado inválido");
  const key = await importEncryptionKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivPart) },
    key,
    fromBase64Url(dataPart),
  );
  return new TextDecoder().decode(plaintext);
}

async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64Url(base64Key);
  if (raw.byteLength !== 32) throw new Error("TOKEN_ENCRYPTION_KEY debe contener exactamente 32 bytes en Base64URL");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
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

function homePage(env: Env): string {
  const base = escapeHtml(env.PUBLIC_BASE_URL || "https://TU-WORKER.workers.dev");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conector Mercado Libre</title><style>${pageCss()}</style></head><body><main><span class="pill">Ofertas Flash Chile</span><h1>Conector privado de Mercado Libre</h1><p>Autoriza tu cuenta sin compartir contraseña. Los tokens se guardan cifrados y la API se protege con una clave independiente.</p><div class="actions"><a class="primary" href="/connect">Conectar Mercado Libre</a><a href="/openapi.json">Ver OpenAPI</a><a href="/privacy">Privacidad</a></div><section><h2>Direcciones</h2><code>${base}/connect</code><code>${base}/openapi.json</code></section></main></body></html>`;
}

function privacyPage(): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacidad</title><style>${pageCss()}</style></head><body><main><span class="pill">Privacidad</span><h1>Política de privacidad del conector</h1><p>Este conector privado almacena únicamente los tokens OAuth autorizados por el propietario, cifrados en reposo, y los historiales de precios solicitados explícitamente.</p><h2>Datos que no se solicitan</h2><p>No se almacena la contraseña de Mercado Libre, códigos de verificación ni datos de tarjetas.</p><h2>Uso</h2><p>Los datos se utilizan para consultar publicaciones, productos y reputación de vendedores mediante la API oficial de Mercado Libre. Puedes revocar la autorización desde Mercado Libre o eliminarla mediante el endpoint de desconexión.</p><h2>Contacto</h2><p>Uso privado de Ofertas Flash Chile.</p></main></body></html>`;
}

function resultPage(title: string, message: string, success: boolean): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${pageCss()}</style></head><body><main><span class="pill">${success ? "Conectado" : "Atención"}</span><h1>${escapeHtml(title)}</h1><p>${message}</p><div class="actions"><a class="primary" href="/">Volver al inicio</a></div></main></body></html>`;
}

function pageCss(): string {
  return `:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0c0c14;color:#f6f2ff}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 10%,#552bb04a,transparent 35%),#0c0c14}main{width:min(760px,calc(100% - 36px));padding:42px;border:1px solid #ffffff1f;border-radius:28px;background:#171724e8;box-shadow:0 30px 80px #0008}h1{font-size:clamp(2rem,7vw,4rem);line-height:1;margin:.35em 0}h2{margin-top:2rem}p{color:#d0cadc;line-height:1.7}.pill{display:inline-block;padding:8px 12px;border-radius:999px;background:#7c4dff;color:white;font-weight:800}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0}.actions a{padding:14px 18px;border-radius:14px;background:#29283a;color:white;text-decoration:none;font-weight:800}.actions .primary{background:#7c4dff}section{padding:20px;border-radius:18px;background:#0e0e18}code{display:block;overflow-wrap:anywhere;padding:10px;margin:8px 0;background:#050509;border-radius:10px;color:#d9c9ff}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function openApiSchema(env: Env): Record<string, unknown> {
  const server = (env.PUBLIC_BASE_URL || "https://TU-WORKER.workers.dev").replace(/\/$/, "");
  return {
    openapi: "3.1.0",
    info: {
      title: "Ofertas Flash Mercado Libre Connector",
      version: "1.0.0",
      description: "Busca y analiza ofertas reales de Mercado Libre Chile usando la API oficial y una cuenta autorizada.",
    },
    servers: [{ url: server }],
    components: {
      securitySchemes: { connectorKey: { type: "http", scheme: "bearer" } },
      schemas: {
        AnalyzeRequest: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL normal o afiliada de Mercado Libre" },
            itemId: { type: "string", description: "ID de publicación, por ejemplo MLC123" },
            productId: { type: "string", description: "ID de producto de catálogo, por ejemplo MLC123" },
            query: { type: "string", description: "Texto para buscar cuando no hay URL o ID" },
            saveSnapshot: { type: "boolean", default: true },
          },
        },
      },
    },
    security: [{ connectorKey: [] }],
    paths: {
      "/api/status": {
        get: {
          operationId: "getMercadoLibreConnectionStatus",
          summary: "Comprueba si la cuenta de Mercado Libre está conectada",
          responses: { "200": { description: "Estado de conexión" } },
        },
      },
      "/api/search": {
        get: {
          operationId: "searchMercadoLibreChile",
          summary: "Busca publicaciones reales en Mercado Libre Chile",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Producto a buscar" },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["relevance", "price_asc", "price_desc"] } },
          ],
          responses: { "200": { description: "Resultados normalizados" } },
        },
      },
      "/api/items/{itemId}": {
        get: {
          operationId: "getMercadoLibreItem",
          summary: "Obtiene una publicación y la reputación de su vendedor",
          parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Detalle del ítem" } },
        },
      },
      "/api/products/{productId}": {
        get: {
          operationId: "getMercadoLibreCatalogProduct",
          summary: "Obtiene los datos de un producto de catálogo",
          parameters: [{ name: "productId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Detalle del producto" } },
        },
      },
      "/api/analyze": {
        post: {
          operationId: "analyzeMercadoLibreOffer",
          summary: "Analiza descuento, comparables, confianza y posibles errores de precio",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AnalyzeRequest" } } },
          },
          responses: { "200": { description: "Análisis completo de la oferta" } },
        },
      },
      "/api/snapshot": {
        post: {
          operationId: "saveMercadoLibrePriceSnapshot",
          summary: "Guarda el precio actual de una publicación para formar historial",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["itemId"],
                  properties: { itemId: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "Captura guardada" } },
        },
      },
      "/api/history/{resourceId}": {
        get: {
          operationId: "getMercadoLibrePriceHistory",
          summary: "Obtiene el historial guardado de una publicación",
          parameters: [{ name: "resourceId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Historial de precios" } },
        },
      },
    },
  };
}
