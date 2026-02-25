#!/usr/bin/env bash
set -euo pipefail

mkdir -p /work
cd /work
mkdir -p cityjson
citygml-tools to-cityjson -o cityjson .

exec node /app/docker/job-runner.js
