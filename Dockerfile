FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npx prisma generate --config prisma-auth.config.ts

RUN rm -rf dist && npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
