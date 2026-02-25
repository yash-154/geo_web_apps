#!/usr/bin/env bash
set -euo pipefail

if ! command -v gdalinfo >/dev/null 2>&1; then
  echo "GDAL is required but not found in PATH."
  echo "Install GDAL first, then re-run this script."
  exit 1
fi

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <input.tif> <output_cog.tif>"
  exit 1
fi

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
  echo "Input file not found: $INPUT"
  exit 1
fi

echo "Converting to COG..."
gdal_translate "$INPUT" "$OUTPUT" \
  -of COG \
  -co COMPRESS=DEFLATE \
  -co PREDICTOR=2 \
  -co BIGTIFF=IF_SAFER \
  -co NUM_THREADS=ALL_CPUS

echo "Building overviews..."
gdaladdo -r average "$OUTPUT" 2 4 8 16

echo "Done: $OUTPUT"
