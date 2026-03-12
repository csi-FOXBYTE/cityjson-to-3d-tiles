import { mkdir, rm } from "node:fs/promises";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "../dist/index.js";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }

  switch (value.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "y":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "n":
    case "off":
      return false;
    default:
      throw new Error(`Invalid boolean value: ${value}`);
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value: ${value}`);
  }

  return parsed;
}

function optionalString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function shouldShowStackTrace(): boolean {
  const raw = (process.env.SHOW_STACK_TRACE ?? "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function printNiceError(error: unknown): void {
  const message = getErrorMessage(error);

  console.error("");
  console.error("Job failed.");
  console.error(`Reason: ${message}`);

  if (message.includes("No valid src srs found please provide one!")) {
    console.error("");
    console.error("Hint: Source CRS (SRC_SRS) could not be detected.");
    console.error("Provide SRC_SRS explicitly, for example:");
    console.error(
      '  -e SRC_SRS="+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs"',
    );
    console.error(
      "Or ensure CityJSON metadata.referenceSystem is present and valid.",
    );
  }

  if (shouldShowStackTrace() && error instanceof Error && error.stack) {
    console.error("");
    console.error("Stack trace:");
    console.error(error.stack);
  } else {
    console.error("");
    console.error("Set SHOW_STACK_TRACE=true to print full stack trace.");
  }
}

async function main() {
  const inputDir = process.env.INPUT_DIR ?? "/work";
  const tilesOutputDir = process.env.OUTPUT_DIR ?? "/work/tiles";
  const internalDbDir = process.env.INTERNAL_DB_DIR ?? "/tmp/cityjson-to-3d-tiles";

  const appearance = process.env.APPEARANCE ?? "rgbTexture";
  const threadCount = parseInteger(process.env.THREAD_COUNT, 4);
  const hasAlphaEnabled = parseBoolean(process.env.HAS_ALPHA_ENABLED, true);
  const simplifyAddresses = parseBoolean(process.env.SIMPLIFY_ADDRESSES, false);
  const srcSRS = optionalString(process.env.SRC_SRS);
  const destSRS = optionalString(process.env.DEST_SRS);

  // Keep temporary DB work on container-local storage for faster SQLite I/O.
  await rm(internalDbDir, { recursive: true, force: true });
  await mkdir(internalDbDir, { recursive: true });

  // Ensure previous run outputs are not picked up as input JSON.
  // Skip if OUTPUT_DIR is explicitly set — user owns that directory.
  if (!process.env.OUTPUT_DIR) {
    await rm(tilesOutputDir, { recursive: true, force: true });
    await mkdir(tilesOutputDir, { recursive: true });
  }

  console.log(`Using internal DB directory: ${internalDbDir}`);
  console.log("Step 1/2: build tile database from CityJSON");
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    inputDir,
    internalDbDir,
    appearance,
    (progress) => {
      const pct = Math.round(progress * 10000) / 100;
      console.log(`[cityjson] ${pct}%`);
    },
    {
      threadCount,
      srcSRS,
      destSRS,
    },
  );

  console.log("Step 2/2: generate Cesium 3D Tiles");
  await generate3DTilesFromTileDatabase(
    dbFilePath,
    tilesOutputDir,
    hasAlphaEnabled,
    (progress, files) => {
      const pct = Math.round(progress * 10000) / 100;
      if (files?.length) {
        console.log(`[tiles] ${pct}% (${files.length} file(s) in last batch)`);
        return;
      }
      console.log(`[tiles] ${pct}%`);
    },
    {
      threadCount,
      simplifyAdresses: simplifyAddresses,
    },
  );

  console.log(`Done. Tiles written to: ${tilesOutputDir}`);
}

try {
  await main();
} catch (error) {
  printNiceError(error);
  process.exit(1);
}
