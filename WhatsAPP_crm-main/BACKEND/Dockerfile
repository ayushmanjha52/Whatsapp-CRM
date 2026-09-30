FROM oven/bun:1.3-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY services ./services
COPY migrations ./migrations
ENV NODE_ENV=production
USER bun
# Each service overrides the command (see docker-compose.yml).
CMD ["bun", "run", "services/api-gateway/index.ts"]
