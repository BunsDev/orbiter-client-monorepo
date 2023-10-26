FROM docker.io/node:lts-alpine
WORKDIR /app

RUN npm i -g pnpm

COPY package.json .
RUN pnpm i

COPY ./ .

RUN pnpm run build
EXPOSE 3000
CMD ["node","./dist/main.js"]
