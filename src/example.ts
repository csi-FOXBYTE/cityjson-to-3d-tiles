import path from "path";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "D:\\downloads\\Area2_5cm";

const appearance = "rgbTexture";

const outputFolder = "D:\\downloads\\Area2_5cm";

(async () => {
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    inputFolder,
    outputFolder,
    appearance,
    console.log,
    { threadCount: 2, srcSRS: "25832" }
  );

  // console.log("ENDED")

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(outputFolder, "tiles"),
    false,
    console.log,
    {
      threadCount: 2,
    }
  );
})();
