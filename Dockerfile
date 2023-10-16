FROM docker.io/node:lts-alpine as builder

# RUN apk update && apk add python3 make g++ && rm -rf /var/cache/apk/*

RUN apk add --no-cache g++ make python3 \
    && npm install -g node-gyp

RUN yarn config set ignore-engines true \
    && yarn config set registry https://registry.npm.taobao.org/

WORKDIR /app
COPY package.json yarn.lock ./

RUN yarn install --network-timeout 600000
