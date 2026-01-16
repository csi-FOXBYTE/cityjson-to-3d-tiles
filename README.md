# cityjson-to-3d-tiles 🚀📦

A Node.js library for converting [CityJSON](https://www.cityjson.org/) files into [Cesium 3D Tiles](https://cesium.com/3d-tiles/) with automatic texture packing and Basis compression. Supports generating three levels of detail (LODs) for different distance ranges.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Options Overview](#options-overview)
- [CLI Wrapper Example](#cli-wrapper-example)
- [Contributing](#contributing)
- [License](#license)

<a id="features" />

## 🎉 Features

- **🏙️ CityJSON to Tile Database**: Parses CityJSON files and builds a tile database optimized for 3D Tiles generation. 🛠️
- **🗺️ 3D Tiles Generation**: Converts the tile database into Cesium 3D Tiles, including geometry, textures, and metadata. 🎨
- **🖼️ Automatic Texture Packing**: Packs textures into atlases and compresses them with [Basis](https://github.com/BinomialLLC/basis_universal) for efficient streaming. ⚡
- **📏 Multiple LODs**: Generates three LODs (LOD0, LOD1, LOD2) to balance detail and performance based on camera distance. 🔍
- **🧵 Customizable Threading**: Control the number of worker threads for CPU-bound tasks. 🛡️

<a id="installation" />

## 📥 Installation

```bash
npm install @csi-foxbyte/cityjson-to-3d-tiles
```
<a id="usage" />

## 💻 Usage

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
    { threadCount: 1 } // Options: number of worker threads 🧵
  );

  // Step 2: Generate Cesium 3D Tiles from the tile database 🛠️
  await generate3DTilesFromTileDatabase(
    dbFilePath, // Path to the generated tile database
    "D:\\generator_test\\tiles", // Output folder for 3D Tiles 🗂️
    console.log, // Progress callback 📈
    { threadCount: 1 } // Options: number of worker threads 🔧
  );
})();

export { generate3DTilesFromTileDatabase, generateTileDatabaseFromCityJSON };
```

<a id="api" />

## ⚙️ API

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

## 🛠️ Options Overview

| Option        | Default            | Description                                          |
| ------------- | ------------------ | ---------------------------------------------------- |
| `appearance`  | `"rgbTexture"`     | Which CityGML appearance to use. 🎨                  |
| `threadCount` | `os.cpus().length` | Number of parallel worker threads. 🧵                |

<a id="cli-wrapper-example" />

## 📜 CLI Wrapper Example

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
    { threadCount: 4 }
  );

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(out, "tiles"),
    console.log,
    { threadCount: 4 }
  );
})();
```

<a id="contributing" />

## 🤝 Contributing

Contributions are welcome! Please open issues or pull requests on the GitHub repository. 🙌

## License

This library is licensed under the [GNU Lesser General Public License](https://www.gnu.org/licenses/#LGPL).