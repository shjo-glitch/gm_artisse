# 아띠제 음료 주문 · 사내 쿠버네티스용 이미지 (server/server.mjs)
# 런타임 의존 패키지가 없어서 Node 공식 이미지에 소스만 복사한다. (SQLite는 Node 내장 node:sqlite)
FROM node:24-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    NODE_USE_ENV_PROXY=1 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

WORKDIR /app
COPY package.json ./
COPY functions ./functions
COPY lib ./lib
COPY migrations ./migrations
COPY server ./server
COPY src/frontend ./src/frontend

# node 사용자(uid 1000)로 실행한다. SQLite 파일은 /data(퍼시스턴트 볼륨)에 둔다.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080

CMD ["node", "server/server.mjs"]
