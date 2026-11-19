# FlockMap – Produktions-Image (App + Sync-Server in einem Container)
# Build:  docker build -t flockmap .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional zur Build-Zeit (wird in die App eingebacken)
ARG VITE_GOOGLE_MAPS_API_KEY=
ARG VITE_GOOGLE_MAP_ID=
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/server.js ./server/server.js
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1
CMD ["node", "server/server.js"]
