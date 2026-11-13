# Cibles :
#   dev   Vite en middleware dans le serveur Node : HMR, aucune compilation (sources montées en volume)
#   prod  frontend compilé servi par Node (cible par défaut, utilisée pour Cloudflare)

FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci && chown -R node:node /app
COPY --chown=node:node vite.config.js ./
USER node
ENV NODE_ENV=development PORT=8900 DATA_DIR=/app/data
EXPOSE 8900
# --watch-path=server : le serveur redémarre quand un fichier de server/ change ; Vite gère web/
CMD ["node", "--watch-path=server", "server/index.js"]

FROM node:22-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY vite.config.js ./
COPY web ./web
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /build/dist ./dist
ENV NODE_ENV=production PORT=8900 DATA_DIR=/app/data STATIC_DIR=/app/dist
USER node
EXPOSE 8900
CMD ["node", "server/index.js"]
