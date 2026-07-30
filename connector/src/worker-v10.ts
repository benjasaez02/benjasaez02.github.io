import workerV9 from "./worker-v9";

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
  BROWSER: BrowserBinding;
}

const DEBUG_PATH = "/debug/meta-quest-render";
const SEARCH_URL = "https://listado.mercadolibre.cl/meta-quest-3s-128-gb";

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "10.0.0",
        searchMode: "v9-parser-with-visual-debug",
        browserBinding: Boolean(env.BROWSER),
        visualDebugPath: DEBUG_PATH,
      });
    }

    if (request.method === "GET" && path === DEBUG_PATH) {
      return visualDebug(env, ctx);
    }

    return workerV9.fetch(request, env as never, ctx as never);
  },
};

async function visualDebug(env: Env, ctx?: ExecutionContextLike): Promise<Response> {
  if (!env.BROWSER) return htmlPage("Falta el binding BROWSER.", 500);

  const cache = defaultCache();
  const cacheKey = new Request("https://cache.ofertasflash.local/debug/meta-quest-render-v10");
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("x-ofertasflash-cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  let snapshot: Response;
  try {
    snapshot = await env.BROWSER.quickAction("snapshot", {
      url: SEARCH_URL,
      formats: ["screenshot", "content"],
      screenshotOptions: {
        fullPage: true,
        type: "png",
      },
      viewport: {
        width: 1440,
        height: 1200,
        deviceScaleFactor: 1,
      },
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 60000,
      },
      waitForTimeout: 5000,
      actionTimeout: 60000,
      rejectResourceTypes: ["media", "font"],
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      setExtraHTTPHeaders: {
        "Accept-Language": "es-CL,es;q=0.9",
      },
      cacheTTL: 3600,
    });
  } catch (error) {
    return htmlPage(`Browser Run falló: ${escapeHtml(error instanceof Error ? error.message : "Error inesperado")}`, 502);
  }

  const raw = await snapshot.text();
  if (!snapshot.ok) {
    return htmlPage(`Browser Run respondió ${snapshot.status}: ${escapeHtml(raw.slice(0, 1200))}`, 502);
  }

  const envelope = parseObject(raw);
  const result = objectValue(envelope.result) || envelope;
  const screenshot = stringValue(result.screenshot) || "";
  const content = stringValue(result.content) || "";
  const title = stripTags(content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const visibleText = stripTags(content)
    .replace(/\s+/g, " ")
    .slice(0, 1600);
  const anchors = (content.match(/<a\b/gi) || []).length;
  const mlcOccurrences = (content.match(/MLC(?:-|\d)/gi) || []).length;
  const browserMs = snapshot.headers.get("x-browser-ms-used");

  const body = screenshot
    ? `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnóstico visual Mercado Libre</title><style>body{margin:0;background:#11131a;color:#f5f7ff;font-family:system-ui,sans-serif}main{width:min(1400px,calc(100% - 24px));margin:20px auto}.card{padding:18px;border:1px solid #ffffff22;border-radius:18px;background:#1a1d27;margin-bottom:18px}img{display:block;width:100%;height:auto;border-radius:14px;background:white}code{overflow-wrap:anywhere;color:#d8c8ff}pre{white-space:pre-wrap;word-break:break-word;color:#cbd1df}</style></head><body><main><div class="card"><h1>Diagnóstico visual de Mercado Libre</h1><p>Esta es la página exacta recibida por Cloudflare Browser Run.</p><p><strong>Título:</strong> ${escapeHtml(title || "Sin título")}</p><p><strong>HTML:</strong> ${content.length} caracteres · <strong>anchors:</strong> ${anchors} · <strong>MLC:</strong> ${mlcOccurrences} · <strong>browser ms:</strong> ${escapeHtml(browserMs || "n/d")}</p><code>${SEARCH_URL}</code><details><summary>Texto visible inicial</summary><pre>${escapeHtml(visibleText || "Sin texto visible")}</pre></details></div><img alt="Captura renderizada de Mercado Libre" src="data:image/png;base64,${screenshot}"></main></body></html>`
    : `<!doctype html><html lang="es"><body><h1>No se recibió screenshot</h1><pre>${escapeHtml(raw.slice(0, 3000))}</pre></body></html>`;

  const response = new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "x-ofertasflash-cache": "MISS",
    },
  });

  if (cache) {
    const put = cache.put(cacheKey, response.clone());
    if (ctx) ctx.waitUntil(put);
    else await put;
  }
  return response;
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

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function stripTags(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
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

function htmlPage(message: string, status: number): Response {
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnóstico</title></head><body><pre>${message}</pre></body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
