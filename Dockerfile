FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npx prisma generate --config prisma-auth.config.ts

RUN rm -rf dist && npm run build

EXPOSE 3000

COPY entrypoint.sh ./entrypoint.sh
COPY scripts/setup-food-database.sh ./scripts/setup-food-database.sh
RUN chmod +x entrypoint.sh && chmod +x scripts/setup-food-database.sh

CMD ["sh", "entrypoint.sh"]
