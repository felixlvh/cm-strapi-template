# Multi-stage build for Strapi template

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache python3 make g++

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built admin panel (dist/build/) and source code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/favicon.png ./favicon.png

EXPOSE 1337

CMD ["npm", "run", "start"]
