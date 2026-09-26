# ---- build stage -------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- production stage --------------------------------------------------
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only: no typescript, no test tooling in the image.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Migrations are plain JavaScript and ship as-is: the same files run in
# development, CI and production with no build step in between.
COPY knexfile.js ./
COPY db ./db

# Run as an unprivileged user. node:alpine ships a `node` user for this.
USER node

# Documentation only - the platform injects the real PORT at runtime.
EXPOSE 3000

# Migrations run before the server accepts traffic. A failed migration should
# stop the deploy rather than serve requests against a half-migrated schema.
CMD ["sh", "-c", "npm run migrate && node dist/server.js"]
