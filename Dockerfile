FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS prepared
RUN apt-get update -qq && apt-get install -y --no-install-recommends --only-upgrade \
    perl-base=5.36.0-7+deb12u4 libpcre2-8-0=10.42-1+deb12u2 tzdata=2026c-0+deb12u1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 PORT=8787 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY packages/splatnet3-compat ./packages/splatnet3-compat
COPY scripts/trim-platform-binaries.mjs ./scripts/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline \
    --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000 \
    && node scripts/trim-platform-binaries.mjs
COPY server ./server
COPY dist ./dist
COPY README.md LICENSE NOTICE THIRD_PARTY_NOTICES.md THIRD_PARTY_PACKAGES.json BETA_TESTING.md SECURITY.md CHANGELOG.md VALIDATION.md UPDATING.md ./
COPY scripts/generate-notices.mjs scripts/check-splatnet-compat.mjs scripts/notice-supplements.mjs ./scripts/
COPY licenses ./licenses
RUN node scripts/check-splatnet-compat.mjs && node scripts/generate-notices.mjs --check --bundle
RUN mkdir -p /data && chown node:node /data
# Runtime uses node directly; npm, Corepack and Yarn are build tools only.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
# Copy the prepared filesystem so removed foreign binaries/build tools are not
# retained in downloadable lower image layers.
FROM scratch
COPY --from=prepared / /
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/Awewlife/Salmon-review" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="0.4.0" \
      org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 PORT=8787 DATA_DIR=/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]
