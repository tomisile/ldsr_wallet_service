# build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# production stage
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

COPY knexfile.js ./
COPY db ./db

USER node

EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && node dist/server.js"]
