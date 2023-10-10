FROM orbiter/clients:latest AS builder

# ARG NODE_ENV
ARG BUILD_FLAG
WORKDIR /app/builder
COPY . .

RUN npx nx build explore-DataCrawler ${BUILD_FLAG}

FROM orbiter/clients:latest

WORKDIR /app
COPY --from=builder /app/builder ./
# ENV NODE_ENV=$NODE_ENV
CMD [ "node", "./dist/apps/explore-DataCrawler/main.js" ]
# CMD ["node", "./dist/apps/api-server/main.js"]