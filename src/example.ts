import path from "path";
import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "C:\\Users\\tga\\Downloads\\RegensburgLOD2\\data";

const appearance = "FMETheme";

const outputFolder = "C:\\Users\\tga\\Downloads\\RegensburgLOD2\\tiles";

(async () => {
  const { dbFilePath } = await generateTileDatabaseFromCityJSON(
    inputFolder,
    outputFolder,
    appearance,
    console.log,
    {
      threadCount: 8,
      srcSRS:
        "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
    },
  );

  // const dbFilePath = "c:\\Users\\tga\\Downloads\\LeipzigLOD2\\tiles\\tmp-db.bin";

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    path.join(outputFolder, "tiles"),
    true,
    async (progress, files) => {
      console.log(progress);
    },
    {
      threadCount: 8,
      simplifyAdresses: true,
    },
  );
})();
