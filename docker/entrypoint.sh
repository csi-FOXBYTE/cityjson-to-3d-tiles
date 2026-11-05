#!/bin/sh
set -eu

# This image converts CityJSON only. CityGML has to be converted to CityJSON
# beforehand, e.g. with ghcr.io/csi-foxbyte/citygml-tools-docker.
fail_citygml() {
  echo "" >&2
  echo "Job failed." >&2
  echo "Reason: $1" >&2
  echo "" >&2
  echo "This image only reads CityJSON; it no longer converts CityGML (citygml-tools was removed in 0.0.26)." >&2
  echo "Convert CityGML to CityJSON first, for example:" >&2
  echo '  docker run --rm --network none --user "$(id -u):$(id -g)" -v "$(pwd):/work" \' >&2
  echo '    ghcr.io/csi-foxbyte/citygml-tools-docker:v2.4.1 to-cityjson /work --output /work/cityjson' >&2
  echo "and run this image with INPUT_DIR pointing to the CityJSON files (leave SKIP_CONVERSION unset or set it to true)." >&2
  exit 2
}

case "${SKIP_CONVERSION:-true}" in
  true) ;;
  *) fail_citygml "SKIP_CONVERSION=${SKIP_CONVERSION} is not supported." ;;
esac

mkdir -p /work
cd /work

# Callers that used to rely on the built-in conversion would otherwise get an
# unrelated error from the tiler (no input: "coordinates must be finite numbers").
input_dir="${INPUT_DIR:-/work}"
if [ -d "$input_dir" ] \
  && [ -z "$(find "$input_dir" -type f -name '*.json' | head -n 1)" ] \
  && [ -n "$(find "$input_dir" -type f -iname '*.gml' | head -n 1)" ]; then
  fail_citygml "${input_dir} contains CityGML but no CityJSON (*.json) files."
fi

exec node /app/docker/job-runner.js
