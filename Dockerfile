# =============================================================================
# LAN Library —— 单容器、零 npm 依赖（PDF.js / JSZip 已内置在 public/vendor）
# 基础镜像：官方 Node 22 LTS（内置 node:sqlite，无需 sqlite3 原生编译）
# =============================================================================
FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="LAN Library" \
      org.opencontainers.image.description="Intranet-only digital library for local study materials" \
      org.opencontainers.image.licenses="MIT"

# 这些只是「直接 docker run」时的兜底默认值。
# 使用 docker-compose.yml 时由 environment / .env 覆盖，无需修改本文件。
ENV NODE_ENV=production \
    PORT=8090 \
    DATA_DIR=/data \
    BOOKS_ROOT=/lanpublic/books \
    PUBLIC_ROOT=/lanpublic \
    SCAN_INTERVAL_MIN=10 \
    TZ=Asia/Shanghai

WORKDIR /app
COPY server ./server
COPY public ./public
RUN mkdir -p /data /lanpublic

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-sqlite", "server/index.js"]
