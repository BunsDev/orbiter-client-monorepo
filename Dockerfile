FROM docker.io/node:lts-alpine as builder

# RUN apk update && apk add python3 make g++ && rm -rf /var/cache/apk/*
RUN apk add --no-cache git openssh
RUN apk add --no-cache g++ make python3 \
    && npm install -g pnpm

WORKDIR /app
COPY package.json yarn.lock ./

RUN pnpm install --production
RUN pnpm run postinstall
