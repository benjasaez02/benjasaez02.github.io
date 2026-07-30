# Seguridad

## Secretos

Nunca confirmes en GitHub:

- `ML_CLIENT_SECRET`
- `CONNECTOR_API_KEY`
- `TOKEN_ENCRYPTION_KEY`
- access tokens o refresh tokens

Configúralos solamente mediante `wrangler secret put`.

## Revocación

Puedes desconectar el backend con `POST /api/disconnect` usando la clave del conector. También puedes revocar la aplicación desde la configuración de Mercado Libre.

## Rotación

Si sospechas una filtración:

1. Rota la Secret Key en Mercado Libre.
2. Genera nuevas claves `CONNECTOR_API_KEY` y `TOKEN_ENCRYPTION_KEY`.
3. Elimina la fila de conexión o vuelve a autorizar la cuenta.
4. Actualiza la clave configurada en la Action de ChatGPT.

## Alcance

Este proyecto está diseñado para una sola cuenta privada. Para múltiples usuarios se necesita autenticación propia, aislamiento por usuario y políticas de retención adicionales.
