# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        make \
        g++ \
        python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml tsconfig.json tsup.config.ts ./
COPY src ./src
COPY docker/job-runner.ts ./docker/job-runner.ts

RUN corepack enable \
    && pnpm install --frozen-lockfile \
    && pnpm rebuild sqlite3 sharp esbuild better-sqlite3 cpu-features protobufjs \
    && pnpm run build \
    && pnpm exec tsc docker/job-runner.ts --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --strict --skipLibCheck --outDir docker-dist --rootDir .

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        findutils \
        jq \
        openjdk-17-jre-headless \
        unzip \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    release_json="$(curl -fsSL https://api.github.com/repos/citygml4j/citygml-tools/releases/latest)"; \
    citygml_tools_tag="$(printf '%s' "$release_json" | jq -r '.tag_name')"; \
    citygml_tools_zip_url="$(printf '%s' "$release_json" | jq -r '.assets[] | select(.name | test("^citygml-tools-.*\\.zip$")) | .browser_download_url' | head -n 1)"; \
    test -n "$citygml_tools_zip_url"; \
    curl -fsSL -o /tmp/citygml-tools.zip "$citygml_tools_zip_url"; \
    unzip -q /tmp/citygml-tools.zip -d /opt; \
    tool_dir="$(find /opt -maxdepth 1 -type d -name 'citygml-tools*' | head -n 1)"; \
    test -n "$tool_dir"; \
    ln -s "$tool_dir/citygml-tools" /usr/local/bin/citygml-tools; \
    echo "$citygml_tools_tag" > /opt/citygml-tools.version; \
    rm -f /tmp/citygml-tools.zip

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/docker-dist/docker/job-runner.js ./docker/job-runner.js
COPY package.json ./package.json
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh /usr/local/bin/citygml-tools

ENV APPEARANCE=rgbTexture \
    THREAD_COUNT=4 \
    HAS_ALPHA_ENABLED=true \
    SIMPLIFY_ADDRESSES=false \
    INTERNAL_DB_DIR=/tmp/cityjson-to-3d-tiles \
    SRC_SRS= \
    DEST_SRS=

VOLUME ["/work"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
