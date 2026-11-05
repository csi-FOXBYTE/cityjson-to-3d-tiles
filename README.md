# cityjson-to-3d-tiles

A Node.js library for converting [CityJSON](https://www.cityjson.org/) files into [Cesium 3D Tiles](https://cesium.com/3d-tiles/) with automatic texture packing and Basis compression. Supports generating three levels of detail (LODs) for different distance ranges.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Options Overview](#options-overview)
- [CLI Wrapper Example](#cli-wrapper-example)
- [Docker Job](#docker-job)
- [Airflow DAG Example](#airflow-dag-example)
- [Building from source](#building-from-source)
- [Contributing](#contributing)
- [License](#license)

<a id="features" />

## Features

- **🏙️ CityJSON to Tile Database**: Parses CityJSON files and builds a tile database optimized for 3D Tiles generation. 🛠️
- **🗺️ 3D Tiles Generation**: Converts the tile database into Cesium 3D Tiles, including geometry, textures, and metadata. 🎨
- **🖼️ Automatic Texture Packing**: Packs textures into atlases and compresses them with [Basis](https://github.com/BinomialLLC/basis_universal) for efficient streaming. ⚡
- **📏 Multiple LODs**: Generates three LODs (LOD0, LOD1, LOD2) to balance detail and performance based on camera distance. 🔍
- **🧵 Customizable Threading**: Control the number of worker threads for CPU-bound tasks. 🛡️

<a id="installation" />

## Installation

```bash
npm install @csi-foxbyte/cityjson-to-3d-tiles
```

<a id="usage" />

## Usage

```js
import { generate3DTilesFromTileDatabase } from "cityjson-to-3d-tiles/3dtiles/index.js";
import { generateTileDatabaseFromCityJSON } from "cityjson-to-3d-tiles/cityjson/index.js";

const inputFolder = "D:\\generator_test\\src"; // Folder containing CityJSON files 📂
const appearance = "rgbTexture"; // Texture appearance (e.g., "rgbTexture", "vertexColor") 🎨
const outputFolder = "D:\\generator_test"; // Base output folder for the tile database and tiles 📁

(async () => {
  // Step 1: Convert CityJSON to an on-disk tile database 🏗️
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    inputFolder, // Source folder
    outputFolder, // Destination folder
    appearance, // Appearance mode
    console.log, // Progress callback 📊
    { threadCount: 1 }, // Options: number of worker threads 🧵
  );

  // Step 2: Generate Cesium 3D Tiles from the tile database 🛠️
  await generate3DTilesFromTileDatabase(
    dbFilePath, // Path to the generated tile database
    "D:\\generator_test\\tiles", // Output folder for 3D Tiles 🗂️
    console.log, // Progress callback 📈
    { threadCount: 1 }, // Options: number of worker threads 🔧
  );
})();

export { generate3DTilesFromTileDatabase, generateTileDatabaseFromCityJSON };
```

<a id="api" />

## API

### `generateTileDatabaseFromCityJSON(inputFolder, outputFolder, appearance, progressCallback, options)`

- **inputFolder** `(string)` – Path to a directory containing CityJSON files. 📂
- **outputFolder** `(string)` – Directory where the tile database will be created. 📁
- **appearance** `(string)` – Appearance: e.g. `"rgbTexture"` -> which appearence to use. 🌈
- **progressCallback** `(function)` – Function called with log messages or progress updates. 📢
- **options** `(object)`:
  - `threadCount` `(number)` – Number of worker threads to use (default: number of CPU cores). 🧵

**Returns:** A promise that resolves with an object containing:

- `dbFilePath` `(string)` – File path to the generated tile database (.db file). 📜

### `generate3DTilesFromTileDatabase(dbFilePath, tilesOutputFolder, progressCallback, options)`

- **dbFilePath** `(string)` – Path to the tile database generated in the previous step. 📂
- **tilesOutputFolder** `(string)` – Directory where the Cesium 3D Tiles will be written. 🗂️
- **progressCallback** `(function)` – Function called with log messages or progress updates. 🔔
- **options** `(object)`:
  - `threadCount` `(number)` – Number of worker threads for tile generation (default: number of CPU cores). 🧵

**Returns:** A promise that resolves when 3D Tiles generation is complete. ✅

<a id="options-overview" />

## Options Overview

| Option              | Default            | Description                                                                |
| ------------------- | ------------------ | -------------------------------------------------------------------------- |
| `appearance`        | `"rgbTexture"`     | Which CityGML appearance to use. 🎨                                        |
| `threadCount`       | `os.cpus().length` | Number of parallel worker threads. 🧵                                      |
| `simplifyAddresses` | `false`            | Whether to simplify addresses or not (From multiple to first address only) |

<a id="cli-wrapper-example" />

## CLI Wrapper Example

Wrap the functions in a simple CLI script:

```js
#!/usr/bin/env node
import path from "path";
import { generateTileDatabaseFromCityJSON } from "cityjson-to-3d-tiles/cityjson/index.js";
import { generate3DTilesFromTileDatabase } from "cityjson-to-3d-tiles/3dtiles/index.js";

const [, , src, out, appearance] = process.argv;

(async () => {
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    path.resolve(src),
    path.resolve(out),
    appearance || "rgbTexture",
    console.log,
    { threadCount: 4 },
  );

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(out, "tiles"),
    console.log,
    { threadCount: 4 },
  );
})();
```

<a id="docker-job" />

## Docker Job

The repository provides a Docker-based job runner.

What it does:

- Converts CityJSON files (`**/*.json`) from `INPUT_DIR` (default: `/work`)
- Creates the temporary SQLite DB in container-local storage (`/tmp`) for better performance on Windows mounts
- Writes final 3D Tiles to `OUTPUT_DIR` (default: `/work/tiles`)
- Runs as the unprivileged `node` user (uid/gid 1000); the mounted folder must be writable for it, or pass `--user <uid>:<gid>` matching the folder's owner

The image reads CityJSON only. Since 0.0.26 it no longer contains citygml-tools
(and Java) and does not convert CityGML. Convert CityGML to CityJSON first, for
example with the [citygml-tools image](https://github.com/csi-FOXBYTE/citygml-tools-docker):

```bash
docker run --rm --network none --user "$(id -u):$(id -g)" -v "$(pwd):/work" \
  ghcr.io/csi-foxbyte/citygml-tools-docker:v2.4.1 to-cityjson /work --output /work/cityjson
```

Then run this image with `INPUT_DIR=/work/cityjson`. The job stops with an
error (exit code 2) if `SKIP_CONVERSION` is set to anything other than `true`,
or if `INPUT_DIR` contains CityGML (`*.gml`) but no CityJSON files.

### Build Image

```bash
docker build -t cityjson-to-3d-tiles .
```

### Run on Windows (PowerShell)

Run this from your data folder:

```powershell
docker run --rm -v "${PWD}:/work" cityjson-to-3d-tiles
```

### Run on Linux (bash/zsh)

Run this from your data folder:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$(pwd):/work" cityjson-to-3d-tiles
```

### Optional Environment Variables

```text
APPEARANCE=rgbTexture
THREAD_COUNT=4
HAS_ALPHA_ENABLED=true
SIMPLIFY_ADDRESSES=false
SEMANTIC_SURFACE_COLORS=<JSON object>
INPUT_DIR=/work
OUTPUT_DIR=/work/tiles
INTERNAL_DB_DIR=/tmp/cityjson-to-3d-tiles
SRC_SRS=<proj string>
DEST_SRS=<proj string>
SHOW_STACK_TRACE=false
```

`SKIP_CONVERSION` is only accepted for compatibility with callers of earlier
versions: leave it unset or set it to `true`; any other value stops the job,
as there is no CityGML conversion to run.

`SEMANTIC_SURFACE_COLORS` optionally assigns colors to untextured CityJSON
semantic surfaces. Values may be normalized RGB arrays, normalized RGB objects,
or CSS colors. Use `"*"` as a fallback for semantic surface types that are not
listed. When the variable is omitted, untextured surfaces remain white.

```text
SEMANTIC_SURFACE_COLORS={"RoofSurface":[1,0,0],"WallSurface":"#cccccc","*":{"r":0.9,"g":0.9,"b":0.9}}
```

Find Proj4 strings:

- PROJ documentation: https://proj.org/
- EPSG search (incl. Proj4): https://epsg.io/

Example (PowerShell):

```powershell
docker run --rm -v "${PWD}:/work" -e THREAD_COUNT=8 -e APPEARANCE=rgbTexture cityjson-to-3d-tiles
```

Example (Linux):

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$(pwd):/work" -e THREAD_COUNT=8 -e APPEARANCE=rgbTexture cityjson-to-3d-tiles
```

<a id="airflow-dag-example" />

## Airflow DAG Example

An example DAG is available in:

`examples/airflow/cityjson_to_3d_tiles_dag.py`

It uses two `DockerOperator` tasks that mount the same host folder to `/work` and run without network:
first `ghcr.io/csi-foxbyte/citygml-tools-docker:v2.4.1` converts the CityGML files to `/work/cityjson`,
then this image writes the 3D Tiles to `/work/tiles`.

<a id="building-from-source" />

## Building from source

[pnpm](https://pnpm.io/) is required to build this library.

```bash
pnpm install
pnpm run build
```

<a id="contributing" />

## Contributing

Contributions are welcome! Please open issues or pull requests on the GitHub repository. 🙌

<a id="license" />

## License

This library is licensed under the [GNU Lesser General Public License](https://www.gnu.org/licenses/#LGPL).
