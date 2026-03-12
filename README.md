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

- Runs `citygml-tools to-cityjson -o cityjson .` in `/work` (skippable via `SKIP_CONVERSION`)
- Converts CityJSON files from `INPUT_DIR` (default: `/work`)
- Creates the temporary SQLite DB in container-local storage (`/tmp`) for better performance on Windows mounts
- Writes final 3D Tiles to `OUTPUT_DIR` (default: `/work/tiles`)

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
docker run --rm -v "$(pwd):/work" cityjson-to-3d-tiles
```

### Optional Environment Variables

```text
APPEARANCE=rgbTexture
THREAD_COUNT=4
HAS_ALPHA_ENABLED=true
SIMPLIFY_ADDRESSES=false
SKIP_CONVERSION=false
INPUT_DIR=/work
OUTPUT_DIR=/work/tiles
INTERNAL_DB_DIR=/tmp/cityjson-to-3d-tiles
SRC_SRS=<proj string>
DEST_SRS=<proj string>
SHOW_STACK_TRACE=false
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
docker run --rm -v "$(pwd):/work" -e THREAD_COUNT=8 -e APPEARANCE=rgbTexture cityjson-to-3d-tiles
```

<a id="airflow-dag-example" />

## Airflow DAG Example

An example DAG is available in:

`examples/airflow/cityjson_to_3d_tiles_dag.py`

It uses `DockerOperator`, runs the GHCR image, and mounts one host folder to `/work`.

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
