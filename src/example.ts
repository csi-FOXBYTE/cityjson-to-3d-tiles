import path from "path";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "D:\\test\\src";

const appearance = "rgbTexture";

const outputFolder = "D:\\test\\out";

(async () => {
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    inputFolder,
    outputFolder,
    appearance,
    console.log,
    { threadCount: 16, srcSRS: "25832" }
  );

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(outputFolder, "tiles"),
    false,
    console.log,
    {
      threadCount: 8,
    }
  );
})();
