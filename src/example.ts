import {
  generate3DTilesFromTileDatabase,
  generateTileDatabaseFromCityJSON,
} from "./index.js";

const inputFolder = "D:\\generator_test_trees\\src";

const appearance = "FMETheme";

const outputFolder = "D:\\generator_test_trees";

(async () => {
  // try {
  //   const { dbFilePath } = await generateTileDatabaseFromCityJSON(
  //     inputFolder,
  //     outputFolder,
  //     appearance,
  //     console.log,
  //     { threadCount: 8, srcSRS: "25832" }
  //   );
  // } catch (e) {
  //   console.error(e);
  // }

  // console.log("ENDED")

  const dbFilePath = "D:\\generator_test_trees\\tmp-db.bin"

  await generate3DTilesFromTileDatabase(
    dbFilePath,
    "D:\\generator_test_trees\\tiles",
    console.log,
    { threadCount: 1 }
  );
})();
