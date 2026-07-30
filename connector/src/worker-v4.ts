import workerV3 from "./worker-v3";
import legacyWorker from "./index";

interface Env {
  CONNECTOR_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && path === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "ofertasflash-meli-connector",
        version: "4.0.0",
        searchMode: "catalog-children-sale-price",
        tokenRefresh: "persisted-by-legacy-worker",
      }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    if ((path === "/api/search" && request.method === "GET") || (path === "/api/analyze" && request.method === "POST")) {
      const authHeader = request.headers.get("authorization") || "";
      const customKey = request.headers.get("x-connector-key") || "";
      const supplied = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : customKey.trim();
      if (!env.CONNECTOR_API_KEY || supplied !== env.CONNECTOR_API_KEY) {
        return new Response(JSON.stringify({ error: "unauthorized", message: "Falta una clave válida del conector" }), {
          status: 401,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      const refreshRequest = new Request(`${url.origin}/api/me`, {
        method: "GET",
        headers: request.headers,
      });
      const refreshResponse = await legacyWorker.fetch(refreshRequest, env as never);
      if (!refreshResponse.ok) return refreshResponse;
    }

    return workerV3.fetch(request, env as never);
  },
};
