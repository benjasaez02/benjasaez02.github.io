# Conector privado Mercado Libre → ChatGPT

Backend de solo lectura orientado a **Ofertas Flash Chile**. Permite autorizar una cuenta de Mercado Libre mediante OAuth, buscar publicaciones reales, revisar vendedores, analizar descuentos y guardar historial de precios.

## Seguridad

- Nunca pide ni almacena la contraseña de Mercado Libre.
- Usa OAuth Authorization Code del lado del servidor.
- Verifica `state` para reducir ataques CSRF.
- Guarda access token y refresh token cifrados con AES-256-GCM.
- Protege todos los endpoints de ChatGPT con una clave separada.
- Rota el refresh token cuando Mercado Libre entrega uno nuevo.
- No expone secretos en GitHub.

## Qué puede hacer

- Buscar productos en Mercado Libre Chile (`MLC`).
- Consultar ítems y productos de catálogo.
- Revisar reputación, ventas y señales de confianza del vendedor.
- Comparar una oferta con publicaciones similares.
- Estimar descuento publicado y descuento frente a la mediana.
- Marcar posibles errores de precio como hipótesis, no como certeza.
- Guardar capturas para crear historial propio de precios.

## Limitación importante

La API oficial no garantiza acceso al mismo feed personalizado que aparece en la pantalla de inicio de la app. Este conector trabaja con búsquedas, publicaciones, catálogo y recursos autorizados.

## 1. Crear la aplicación de Mercado Libre

1. Entra al portal de desarrolladores de Mercado Libre y crea una aplicación.
2. Guarda el **App ID** y la **Secret Key** en un administrador de contraseñas.
3. No pegues la Secret Key en ChatGPT ni la subas a GitHub.
4. Después de desplegar el Worker, registra exactamente esta redirect URI:

```text
https://TU-WORKER.workers.dev/oauth/callback
```

La URL debe coincidir exactamente con `ML_REDIRECT_URI`.

## 2. Crear el Worker y D1

Requisitos: Node.js 20+, una cuenta gratuita de Cloudflare y Wrangler.

```bash
cd connector
npm install
npx wrangler login
npx wrangler d1 create ofertasflash-meli
```

Copia `wrangler.toml.example` como `wrangler.toml` y reemplaza el `database_id` y el subdominio.

Inicializa la base:

```bash
npm run db:init:remote
```

## 3. Configurar secretos

```bash
npx wrangler secret put ML_CLIENT_ID
npx wrangler secret put ML_CLIENT_SECRET
npx wrangler secret put CONNECTOR_API_KEY
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Genera valores seguros localmente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Usa una salida distinta para `CONNECTOR_API_KEY` y `TOKEN_ENCRYPTION_KEY`.

## 4. Desplegar y autorizar Mercado Libre

```bash
npm run deploy
```

Abre:

```text
https://TU-WORKER.workers.dev/connect
```

Mercado Libre mostrará su pantalla oficial de autorización. Al terminar, el Worker guardará los tokens cifrados.

## 5. Conectarlo a un GPT personalizado

ChatGPT permite definir Actions mediante un esquema OpenAPI y autenticación API Key.

1. Crea o edita un GPT.
2. Abre **Acciones → Crear acción nueva**.
3. En autenticación elige **API Key**, tipo **Bearer**.
4. Usa como clave el mismo valor de `CONNECTOR_API_KEY`.
5. Importa el esquema desde:

```text
https://TU-WORKER.workers.dev/openapi.json
```

6. Prueba en la vista previa:

```text
Busca audífonos con cancelación de ruido bajo $30.000 en Mercado Libre Chile y revisa cuáles vendedores parecen confiables.
```

## Endpoints principales

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/status` | Estado de la conexión |
| GET | `/api/search?q=...` | Buscar publicaciones |
| GET | `/api/items/:id` | Ítem y vendedor |
| GET | `/api/products/:id` | Producto de catálogo |
| POST | `/api/analyze` | Comparables, descuento y confianza |
| POST | `/api/snapshot` | Guardar precio actual |
| GET | `/api/history/:id` | Historial guardado |

## Ejemplo de análisis

```json
{
  "url": "https://www.mercadolibre.cl/producto/p/MLC123456",
  "saveSnapshot": true
}
```

## Antes de promocionar

El resultado del conector es una ayuda de decisión. Siempre verifica manualmente:

- Variante y capacidad exacta.
- Precio final en checkout.
- Vendedor y garantía.
- Costos y plazo de envío.
- Si el precio anterior parece real.
- Si la publicación sigue activa.
