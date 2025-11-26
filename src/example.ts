import path from "path";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "E:\\test\\src";

const appearance = "FMETheme";

const outputFolder = "D:\\test\\out";

(async () => {
  // const { dbFilePath } = await generateTileDatabaseFromCityJSON(
  //   inputFolder,
  //   outputFolder,
  //   appearance,
  //   console.log,
  //   {
  //     threadCount: 4,
  //     srcSRS:
  //       "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
  //   }
  // );

  const dbFilePath = "D:\\test\\out\\tmp-db.bin";

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(outputFolder, "tiles"),
    true,
    console.log,
    {
      threadCount: 2,
    }
  );
})();
