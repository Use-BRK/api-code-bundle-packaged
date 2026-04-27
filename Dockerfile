# syntax=docker/dockerfile:1.7

# ----------- Builder -----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build tools para compilar better-sqlite3 caso o prebuild não esteja disponível
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Remove devDependencies pra reduzir o tamanho copiado pra imagem final
RUN npm prune --omit=dev

# ----------- Runtime -----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    BUNDLE_DB_PATH=/app/data/bundle.sqlite

# Usuário não-root
RUN groupadd --system app && useradd --system --gid app --create-home app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

# Diretório do SQLite — montar volume aqui em produção pra persistir
RUN mkdir -p /app/data && chown app:app /app/data
VOLUME ["/app/data"]

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/script.js',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" || exit 1

CMD ["node", "dist/main.js"]
