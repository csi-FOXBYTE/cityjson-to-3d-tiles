import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "D:\\generator_test\\src";

const appearance = "rgbTexture";

const outputFolder = "D:\\generator_test";

(async () => {
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    inputFolder,
    outputFolder,
    appearance,
    console.log,
    { threadCount: 1 }
  );

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    "D:\\generator_test\\tiles",
    console.log,
    { threadCount: 1 }
  );
})();
