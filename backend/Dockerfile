# ── Build stage: full toolchain, compile TypeScript ──────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# node-gyp needs these to compile argon2's native addon.
RUN apk add --no-cache python3 make g++

COPY package.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npx prisma generate && npx nest build

# ── Runtime stage: production dependencies only ──────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json ./
COPY prisma ./prisma

# The Prisma CLI is a production dependency here: the container runs
# `migrate deploy` on boot, so it must be present in the image rather than
# fetched from the network at start-up.
RUN npm install --omit=dev \
 && npx prisma generate \
 && apk del python3 make g++ \
 && npm cache clean --force

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Migrations run on boot so a fresh deployment comes up with a valid schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
