import type { GridItem, Tile } from "./types.js";
import { writeFile } from "fs/promises";
import { Grid2D } from "../grid2d/index.js";
import { Box2, Vector2 } from "three";
import type { WorkerWorkReturnType } from "./workerPaylod.js";
import { generateDocument } from "./generateDocument.js";
import { Database } from "sqlite";
import { getIO } from "./io.js";
import path from "path";
import { disposeDocument } from "../functions/disposeDocument.js";

export async function generateCell(
  cells: { data: GridItem; x: number; y: number }[],
  outputFolder: string,
  dbInstance: Database,
  hasAlphaEnabled: boolean
): Promise<WorkerWorkReturnType> {
  const lod2res = await generateDocument(
    cells,
    dbInstance,
    hasAlphaEnabled,
    0.5,
    1 / 32
  );

  if (lod2res === null) return null;

  const io = await getIO();

  const newName = crypto.randomUUID();

  await writeFile(
    path.join(outputFolder, `${newName}_lod2.glb`),
    await io.writeBinary(lod2res.document)
  );

  disposeDocument(lod2res.document);

  let lod2Tile: Tile = {
    boundingVolume: {
      region: [
        lod2res.localBBox.min.x,
        lod2res.localBBox.min.y,
        lod2res.localBBox.max.x,
        lod2res.localBBox.max.y,
        lod2res.localBBox.min.z,
        lod2res.localBBox.max.z,
      ],
    },
    geometricError: 20,
    refine: "REPLACE",
    content: {
      uri: `${newName}_lod2.glb`,
    },
    children: [],
  };

  const lod1Grid = new Grid2D<(typeof cells)[number]["data"]>(
    new Box2(
      new Vector2(lod2res.localBBox.min.x, lod2res.localBBox.min.y),
      new Vector2(lod2res.localBBox.max.x, lod2res.localBBox.max.y)
    ),
    0.0001
  );

  cells.forEach((item) => lod1Grid.add(item.x, item.y, item.data));

  for (const lod1cell of lod1Grid.cells) {
    const lod1res = await generateDocument(
      lod1cell,
      dbInstance,
      hasAlphaEnabled,
      0.1,
      1 / 4
    );

    if (lod1res === null) continue;

    const lod1Name = crypto.randomUUID();

    await writeFile(
      path.join(outputFolder, `${lod1Name}_lod1.glb`),
      await io.writeBinary(lod1res.document)
    );

    disposeDocument(lod1res.document);

    const lod1Tile: Tile = {
      boundingVolume: {
        region: [
          lod1res.localBBox.min.x,
          lod1res.localBBox.min.y,
          lod1res.localBBox.max.x,
          lod1res.localBBox.max.y,
          lod1res.localBBox.min.z,
          lod1res.localBBox.max.z,
        ],
      },
      geometricError: 5,
      refine: "REPLACE",
      content: {
        uri: `${lod1Name}_lod1.glb`,
      },
      children: [],
    };

    lod2Tile.children!.push(lod1Tile);

    const lod0Grid = new Grid2D<(typeof lod1cell)[number]["data"]>(
      new Box2(
        new Vector2(lod1res.localBBox.min.x, lod1res.localBBox.min.y),
        new Vector2(lod1res.localBBox.max.x, lod1res.localBBox.max.y)
      ),
      0.00005
    );

    lod1cell.forEach((item) => lod0Grid.add(item.x, item.y, item.data));

    for (const lod0cell of lod0Grid.cells) {
      const lod0res = await generateDocument(
        lod0cell,
        dbInstance,
        hasAlphaEnabled,
        undefined,
        1
      );

      if (lod0res === null) continue;

      const newName = crypto.randomUUID();

      await writeFile(
        path.join(outputFolder, `${newName}_lod0.glb`),
        await io.writeBinary(lod0res.document)
      );

      disposeDocument(lod0res.document);

      lod1Tile.children!.push({
        boundingVolume: {
          region: [
            lod0res.localBBox.min.x,
            lod0res.localBBox.min.y,
            lod0res.localBBox.max.x,
            lod0res.localBBox.max.y,
            lod0res.localBBox.min.z,
            lod0res.localBBox.max.z,
          ],
        },
        geometricError: 0,
        refine: "REPLACE",
        content: {
          uri: `${newName}_lod0.glb`,
        },
      });
    }
  }

  return {
    boundingVolume: lod2Tile.boundingVolume,
    geometricError: 50,
    refine: "ADD",
    children: [lod2Tile],
  };
}
