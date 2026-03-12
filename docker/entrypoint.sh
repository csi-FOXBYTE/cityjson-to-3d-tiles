#!/usr/bin/env bash
set -euo pipefail

mkdir -p /work
cd /work

if [ "${SKIP_CONVERSION:-false}" != "true" ]; then
  mkdir -p cityjson
  citygml-tools to-cityjson -o cityjson .
fi

exec node /app/docker/job-runner.js
