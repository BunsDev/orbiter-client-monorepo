FROM node:16-alpine
WORKDIR /app

RUN yarn add pm2

COPY package.json package-lock.json ./

RUN yarn install

COPY . ./

RUN yarn run build
CMD [ "node", "maker-client/main.js" ]
