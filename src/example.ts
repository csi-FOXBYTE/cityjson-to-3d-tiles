import path from "path";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "D:\\Strassenbaumkataster_Sommer_Hamburg_2024_03_15";

const appearance = "FMETheme";

const outputFolder = "D:\\test\\out3";

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

  const dbFilePath = "D:\\test\\out3\\tmp-db.bin"

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(outputFolder, "tiles"),
    true,
    console.log,
    {
      threadCount: 8,
    }
  );
})();
