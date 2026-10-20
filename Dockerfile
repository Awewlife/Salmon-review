FROM node:22.23.2-bookworm-slim
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/Awewlife/Salmon-review" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="0.3.12" \
      org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 PORT=8787 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY packages/splatnet3-compat ./packages/splatnet3-compat
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline \
    --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000
COPY server ./server
COPY dist ./dist
COPY README.md LICENSE NOTICE THIRD_PARTY_NOTICES.md THIRD_PARTY_PACKAGES.json BETA_TESTING.md SECURITY.md CHANGELOG.md VALIDATION.md UPDATING.md ./
COPY scripts/generate-notices.mjs scripts/check-splatnet-compat.mjs scripts/notice-supplements.mjs ./scripts/
COPY licenses ./licenses
RUN node scripts/check-splatnet-compat.mjs && node scripts/generate-notices.mjs --check --bundle
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]
