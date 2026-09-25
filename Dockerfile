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

# Run as an unprivileged user. node:alpine ships a `node` user for this.
USER node

# Documentation only - the platform injects the real PORT at runtime.
EXPOSE 3000

CMD ["node", "dist/server.js"]
