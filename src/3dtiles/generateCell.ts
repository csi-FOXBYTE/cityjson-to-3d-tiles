import type { GridItem, Tile } from "./types.js";
import { writeFile } from "fs/promises";
import { Grid2D } from "../grid2d/index.js";
import { Box2, Vector2 } from "three";
import type { WorkerWorkReturnType } from "./workerPaylod.js";
import { generateDocument } from "./generateDocument.js";
import { Database } from "sqlite";
import { getIO } from "./io.js";
import path from "path";

export async function generateCell(
  cells: { data: GridItem; x: number; y: number }[],
  outputFolder: string,
  dbInstance: Database
): Promise<WorkerWorkReturnType> {
  const lod2res = await generateDocument(
    cells,
    dbInstance,
    0.5,
    1 / 32
  );

  const io = await getIO();

  if (lod2res === null) return null;

  const glb_lod2 = await io.writeBinary(lod2res.document);

  const newName = crypto.randomUUID();

  await writeFile(
    path.join(outputFolder, `${newName}_lod2.glb`),
    Buffer.from(glb_lod2)
  );

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

  const lod1Documents = await Promise.all(
    lod1Grid.cells.map(async (lod1cell) => {
      const lod1res = await generateDocument(lod1cell, dbInstance, 0.1, 1 / 4);

      // const lod1res = lod1resInstanced;

      if (lod1res === null) return null;

      const lod0Grid = new Grid2D<(typeof lod1cell)[number]["data"]>(
        new Box2(
          new Vector2(lod1res.localBBox.min.x, lod1res.localBBox.min.y),
          new Vector2(lod1res.localBBox.max.x, lod1res.localBBox.max.y)
        ),
        0.00005
      );

      lod1cell.forEach((item) => lod0Grid.add(item.x, item.y, item.data));

      return {
        document: lod1res.document,
        localBBox: lod1res.localBBox,
        documents: await Promise.all(
          lod0Grid.cells.map(async (lod2cell) => {
            const lod2res = await generateDocument(
              lod2cell,
              dbInstance,
              undefined,
              1
            );

            return lod2res;
          })
        ),
      };
    })
  );

  for (const lod1Document of lod1Documents) {
    if (lod1Document === null) continue;

    const newName = crypto.randomUUID();

    const glb_lod1 = await io.writeBinary(lod1Document.document);

    await writeFile(
      path.join(outputFolder, `${newName}_lod1.glb`),
      Buffer.from(glb_lod1)
    );

    const lod1Tile: Tile = {
      boundingVolume: {
        region: [
          lod1Document.localBBox.min.x,
          lod1Document.localBBox.min.y,
          lod1Document.localBBox.max.x,
          lod1Document.localBBox.max.y,
          lod1Document.localBBox.min.z,
          lod1Document.localBBox.max.z,
        ],
      },
      geometricError: 5,
      refine: "REPLACE",
      content: {
        uri: `${newName}_lod1.glb`,
      },
      children: [],
    };

    lod2Tile.children!.push(lod1Tile);

    for (const lod0Document of lod1Document.documents) {
      if (lod0Document === null) continue;

      const newName = crypto.randomUUID();

      const docLod0 = lod0Document.document;

      const glb_lod0 = await io.writeBinary(docLod0);

      await writeFile(
        path.join(outputFolder, `${newName}_lod0.glb`),
        Buffer.from(glb_lod0)
      );

      lod1Tile.children!.push({
        boundingVolume: {
          region: [
            lod0Document.localBBox.min.x,
            lod0Document.localBBox.min.y,
            lod0Document.localBBox.max.x,
            lod0Document.localBBox.max.y,
            lod0Document.localBBox.min.z,
            lod0Document.localBBox.max.z,
          ],
        },
        // geometricError: calculateBBoxVolume(lod0Document.localBBox) * 0.01,
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
