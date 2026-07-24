# 빌드 단계
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN yarn build

# 실행 단계
FROM node:20-alpine
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY server.cjs ./
COPY db.json ./db.json.seed

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.cjs"]