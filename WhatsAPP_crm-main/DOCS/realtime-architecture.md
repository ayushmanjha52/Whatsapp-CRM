# Real-Time and High-Volume Messaging

## Transport

- WebSocket with Redis pub/sub for inter-process delivery.
- Alternative: Socket.IO with fastify-socket.io and socket.io-redis adapter.

## Authentication

- Token-based handshake for WebSocket; validate access token from cookie or Authorization header.
- No credentials in query string; HTTPS recommended.

## Queues

- OutboundMessages: send operations to WhatsApp Cloud API.
- InboundEvents: webhook payloads normalized for processing.
- Optional: TemplateSends, MediaUploads, AnalyticsSnapshots.

## Workers

- Concurrency configured via WORKER_CONCURRENCY_OUTBOUND and WORKER_CONCURRENCY_INBOUND.
- Retries/backoff applied globally via defaultJobOptions.

## Caching

- inbox:threads:{tenant_id} as sorted set keyed by wa_id.
- inbox:messages:{tenant_id}:{wa_id} list capped for recent messages.

## Rate Limiting

- Per-tenant limits for POST /messages/send.
- WebSocket connection rate limiting per tenant.

## Compression and Limits

- WebSocket per-message deflate with threshold.
- Max payload configured for WebSocket server.

## Docker Compose

- redis, api-gateway, whatsapp-webhook, inbox-service, messaging-worker.
- Environment variables for Redis URL and worker concurrency.

## Frontend

- Subscribe to channel tenant:{tenant_id}:inbox.
- Use cache-backed endpoints for threads and messages.

## Scaling Notes

- Run multiple replicas of worker services.
- Size Redis appropriately or use managed Redis.
- Consider Socket.IO when heartbeat and auto-reconnect are required.

