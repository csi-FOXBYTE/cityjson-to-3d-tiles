# syntax=docker/dockerfile:1.7

# Base image pinned by digest (Node 22 on Alpine 3.24); bump tag and digest together.
ARG NODE_BASE_IMAGE=node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

# Builds the Basis Universal encoder (basisu) for musl. The binaries bundled in
# @gpu-tex-enc/basis are linked against glibc and do not run on Alpine; they are
# basisu 1.15, so the same release is built here from a pinned, checksum-verified
# source archive (its KTX2 output is byte-identical to the bundled binary).
FROM ${NODE_BASE_IMAGE} AS basisu
# Tag 1.15_final; commit and SHA-256 of the source archive must be updated together.
ARG BASISU_COMMIT=962d4ac4222a27e61a9e76c8ee4bf819bedbd749
ARG BASISU_SHA256=a5fa43f2ff8deff10d3c8ce289dd2fadf3e86494f5d32682faef540e0f2fa73b

RUN apk add --no-cache \
        build-base \
        cmake \
        curl

RUN set -eux; \
    curl -fsSL -o /tmp/basisu.tar.gz \
        "https://codeload.github.com/BinomialLLC/basis_universal/tar.gz/${BASISU_COMMIT}"; \
    echo "${BASISU_SHA256}  /tmp/basisu.tar.gz" | sha256sum -c -; \
    mkdir -p /tmp/basisu-src; \
    tar -xzf /tmp/basisu.tar.gz -C /tmp/basisu-src --strip-components=1; \
    cmake -S /tmp/basisu-src -B /tmp/basisu-build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_POLICY_VERSION_MINIMUM=3.5; \
    cmake --build /tmp/basisu-build -j "$(nproc)"; \
    install -D -m 0755 /tmp/basisu-src/bin/basisu /opt/basisu/basisu; \
    strip /opt/basisu/basisu; \
    /opt/basisu/basisu -version

FROM ${NODE_BASE_IMAGE} AS build
WORKDIR /app

RUN apk add --no-cache \
        build-base \
        python3

COPY package.json pnpm-lock.yaml tsconfig.json tsup.config.ts ./
COPY src ./src
COPY docker/job-runner.ts ./docker/job-runner.ts

RUN corepack enable \
    && corepack prepare pnpm@10.34.5 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm rebuild sqlite3 sharp esbuild better-sqlite3 cpu-features protobufjs \
    && pnpm run build \
    && pnpm exec tsc docker/job-runner.ts --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --strict --skipLibCheck --outDir docker-dist --rootDir .

# Swap the bundled glibc basisu binaries for the musl build at the path the
# library resolves (bin/linux-<arch>/basisu); the other platforms' binaries are
# of no use in this image.
COPY --from=basisu /opt/basisu/basisu /tmp/basisu
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64) arch=linux-x64 ;; \
      aarch64) arch=linux-arm64 ;; \
      *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;; \
    esac; \
    bin="$(readlink -f node_modules/@gpu-tex-enc/basis)/bin"; \
    rm -rf "${bin}" node_modules/.bin/basisu-*; \
    install -D -m 0755 /tmp/basisu "${bin}/${arch}/basisu"; \
    "${bin}/${arch}/basisu" -version

FROM ${NODE_BASE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production

# The base image is rebuilt only now and then, so Alpine security fixes published
# since are applied here. REFRESH_EPOCH is part of the build cache key: raise it
# to pick up new fixes without other changes.
ARG REFRESH_EPOCH=0
RUN echo "OS package refresh: ${REFRESH_EPOCH}" \
    && apk upgrade --no-cache

# npm, corepack and yarn are only needed to build (if at all); the job runs plain node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /opt/yarn-v* /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/docker-dist/docker/job-runner.js ./docker/job-runner.js
COPY package.json ./package.json
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh \
    && mkdir -p /work \
    && chown node:node /work

ENV APPEARANCE=rgbTexture \
    THREAD_COUNT=4 \
    HAS_ALPHA_ENABLED=true \
    SIMPLIFY_ADDRESSES=false \
    SEMANTIC_SURFACE_COLORS= \
    INTERNAL_DB_DIR=/tmp/cityjson-to-3d-tiles \
    SRC_SRS= \
    DEST_SRS=

VOLUME ["/work"]

# Runs unprivileged; pass --user <uid>:<gid> to match the owner of a bind-mounted /work.
USER node

ENTRYPOINT ["/app/docker/entrypoint.sh"]
