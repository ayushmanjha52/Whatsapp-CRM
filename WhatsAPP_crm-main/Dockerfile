# One image for every service: the gateway serves the built frontend (STATIC_DIR),
# and the workers run the same code with a different command.
#   docker build -t whatsapp-crm .
#   docker run -p 4000:4000 --env-file BACKEND/.env whatsapp-crm                        # web app + API
#   docker run --env-file BACKEND/.env whatsapp-crm bun run services/inbox-service/index.ts  # a worker

FROM oven/bun:1.3-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

FROM oven/bun:1.3-slim
WORKDIR /app
COPY BACKEND/package.json BACKEND/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY BACKEND/src ./src
COPY BACKEND/services ./services
COPY BACKEND/migrations ./migrations
COPY BACKEND/tools/migrate.ts ./tools/migrate.ts
COPY --from=web /web/dist ./public
ENV NODE_ENV=production STATIC_DIR=/app/public
USER bun
EXPOSE 4000
CMD ["bun", "run", "services/api-gateway/index.ts"]
