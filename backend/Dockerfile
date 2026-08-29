FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate && npx nest build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++
COPY package.json ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate && apk del python3 make g++
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Migrations run on boot so a fresh deployment comes up with a valid schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
