# Debian slim rather than Alpine: argon2 publishes prebuilt binaries for glibc
# but not for musl, so Alpine forces a from-source native build — slow, and the
# most common way this image fails on a memory-limited builder.
#
# Single stage on purpose. A two-stage build has to install and compile the
# native dependencies twice, which doubles the slowest part of the build for a
# smaller image than this deployment needs. `npm prune` at the end drops the
# build-only packages instead.
FROM node:22-slim

WORKDIR /app

# openssl is required by Prisma's query engine; the toolchain is a fallback for
# any dependency that still has to build from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY prisma ./prisma

# postinstall runs `prisma generate`, so the schema has to be in place first.
RUN npm install --no-audit --no-fund

COPY . .

RUN npx prisma generate \
 && npx nest build \
 && npm prune --omit=dev \
 && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Migrations run on boot so a fresh deployment comes up with a valid schema.
# The Prisma CLI is a production dependency for exactly this reason.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
