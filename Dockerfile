# syntax=docker/dockerfile:1.7

# Base image pinned by digest (Node 22 on Debian 13 "trixie"); bump tag and digest together.
ARG NODE_BASE_IMAGE=node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6

FROM ${NODE_BASE_IMAGE} AS build
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
    && corepack prepare pnpm@10.34.5 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm rebuild sqlite3 sharp esbuild better-sqlite3 cpu-features protobufjs \
    && pnpm run build \
    && pnpm exec tsc docker/job-runner.ts --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --strict --skipLibCheck --outDir docker-dist --rootDir .

# Fetches citygml-tools (used when SKIP_CONVERSION is not "true") at a pinned,
# checksum-verified release instead of whatever "latest" is at build time.
FROM ${NODE_BASE_IMAGE} AS citygml-tools
# 2.4.1 like the pipeline's citygml-tools image: 2.5.0 renames the CityJSON
# address keys (ThoroughfareName -> thoroughfareName), which downstream readers
# of the address attributes do not expect.
ARG CITYGML_TOOLS_VERSION=2.4.1
# SHA-256 of the release zip; must be updated together with CITYGML_TOOLS_VERSION.
ARG CITYGML_TOOLS_SHA256=89c41ecb602a3f4a628c646ac3eb5aeffdc4c62ab07f1b20f1bd2efb65561806
# Replace the bundled Jackson 2.20.1 with the 2.21.8 patch release, which fixes
# known CVEs in jackson-core/-databind (there is no fixed 2.20.x release), and
# raise jackson-annotations to the matching 2.21 line. Drop this once
# citygml-tools ships Jackson >= 2.21.8.
ARG JACKSON_BUNDLED=2.20.1
ARG JACKSON_VERSION=2.21.8
ARG JACKSON_ANNOTATIONS_BUNDLED=2.20
ARG JACKSON_ANNOTATIONS_VERSION=2.21
ARG JACKSON_ANNOTATIONS_SHA256=53ca085f4a150f703f49e1aabd935bd03b43e1ea3d55d135438292af22cef56b
ARG JACKSON_CORE_SHA256=604ef7765013daf5cde192e40bc4c8412c4ca93f4aaf7bf8e9a62fad1e1026bb
ARG JACKSON_DATABIND_SHA256=ad77f2285717e2f34c319d988b7c85783a47d0b33f33a501d1fcbf196e61bbaa

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        unzip \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    curl -fsSL -o /tmp/citygml-tools.zip \
        "https://github.com/citygml4j/citygml-tools/releases/download/v${CITYGML_TOOLS_VERSION}/citygml-tools-${CITYGML_TOOLS_VERSION}.zip"; \
    echo "${CITYGML_TOOLS_SHA256}  /tmp/citygml-tools.zip" | sha256sum -c -; \
    unzip -q /tmp/citygml-tools.zip -d /opt; \
    mv "/opt/citygml-tools-${CITYGML_TOOLS_VERSION}" /opt/citygml-tools; \
    rm -f /tmp/citygml-tools.zip; \
    cd /opt/citygml-tools/lib; \
    for spec in \
      "jackson-annotations ${JACKSON_ANNOTATIONS_BUNDLED} ${JACKSON_ANNOTATIONS_VERSION} ${JACKSON_ANNOTATIONS_SHA256}" \
      "jackson-core ${JACKSON_BUNDLED} ${JACKSON_VERSION} ${JACKSON_CORE_SHA256}" \
      "jackson-databind ${JACKSON_BUNDLED} ${JACKSON_VERSION} ${JACKSON_DATABIND_SHA256}"; do \
      set -- $spec; \
      test -f "$1-$2.jar"; \
      curl -fsSL -o "$1-$3.jar" \
        "https://repo1.maven.org/maven2/com/fasterxml/jackson/core/$1/$3/$1-$3.jar"; \
      echo "$4  $1-$3.jar" | sha256sum -c -; \
      rm "$1-$2.jar"; \
      sed -i "s/$1-$2\.jar/$1-$3.jar/g" /opt/citygml-tools/citygml-tools; \
      if grep -q "$1-$2\.jar" /opt/citygml-tools/citygml-tools; then exit 1; fi; \
    done; \
    echo "v${CITYGML_TOOLS_VERSION}" > /opt/citygml-tools.version

FROM ${NODE_BASE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production

# The base image is rebuilt only now and then, so Debian security fixes published
# since are applied here. REFRESH_EPOCH is part of the build cache key: raise it
# to pick up new fixes without other changes.
ARG REFRESH_EPOCH=0
RUN echo "OS package refresh: ${REFRESH_EPOCH}" \
    && apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        findutils \
        openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# npm and corepack are only needed to build; the job runs plain node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=citygml-tools /opt/citygml-tools /opt/citygml-tools
COPY --from=citygml-tools /opt/citygml-tools.version /opt/citygml-tools.version
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/docker-dist/docker/job-runner.js ./docker/job-runner.js
COPY package.json ./package.json
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh /opt/citygml-tools/citygml-tools \
    && ln -s /opt/citygml-tools/citygml-tools /usr/local/bin/citygml-tools \
    && mkdir -p /work \
    && chown node:node /work

ENV APPEARANCE=rgbTexture \
    THREAD_COUNT=4 \
    HAS_ALPHA_ENABLED=true \
    SIMPLIFY_ADDRESSES=false \
    SEMANTIC_SURFACE_COLORS= \
    SKIP_CONVERSION=false \
    INTERNAL_DB_DIR=/tmp/cityjson-to-3d-tiles \
    SRC_SRS= \
    DEST_SRS=

VOLUME ["/work"]

# Runs unprivileged; pass --user <uid>:<gid> to match the owner of a bind-mounted /work.
USER node

ENTRYPOINT ["/app/docker/entrypoint.sh"]
