FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY .npmrc ./
RUN npm ci
RUN apk add --no-cache bash

COPY . .
RUN ./rebuild_api.sh

FROM nginx:alpine
ARG API_VERSION=4.1.0
COPY --from=builder /app/dist/${API_VERSION}/ /usr/share/nginx/html/${API_VERSION}/
RUN ln -s /usr/share/nginx/html/${API_VERSION} /usr/share/nginx/html/latest
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
