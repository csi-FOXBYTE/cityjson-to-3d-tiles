import type { GridItem, Tile } from "./types.js";
import { Grid2D } from "../grid2d/index.js";
import { Box2, Vector2 } from "three";
import path from "path";
import {
  GenerateDocumentWorkerPayload,
  GenerateDocumentWorkerReturnType,
} from "./generateDocumentWorker.js";
import { fork } from "child_process";
import { WorkerWorkReturnType } from "./worker.js";

async function generateDocumentWorkerCall(
  payload: GenerateDocumentWorkerPayload
): Promise<GenerateDocumentWorkerReturnType> {
  const worker = fork(
    path.join(import.meta.dirname, "generateDocumentWorker.js"),
    ["--expose-gc"],
  );

  let resolve: ((data: GenerateDocumentWorkerReturnType) => void) | null = null;
  let reject: ((err: Error) => void) | null = null;

  const p = new Promise<GenerateDocumentWorkerReturnType>((r, rj) => {
    resolve = r;
    reject = rj;
  });

  worker.on("message", (data: GenerateDocumentWorkerReturnType) => {
    resolve!(data);
  });

  worker.on("exit", (code, signal) => {
    if (code !== 0) {
      reject!(new Error(`Worker exited with code ${code}, signal ${signal}`));
    }
  });

  worker.on("error", (error) => {
    reject!(error);
  });

  worker.send(payload satisfies GenerateDocumentWorkerPayload);

  return p;
}

export async function generateCell(
  cells: { data: GridItem; x: number; y: number }[],
  outputFolder: string,
  databasePath: string,
  hasAlphaEnabled: boolean
): Promise<WorkerWorkReturnType> {
  const newName = crypto.randomUUID();

  const lod2res = await generateDocumentWorkerCall({
    cells,
    databasePath,
    hasAlphaEnabled,
    minVolume: 0.5,
    resizeFactor: 1 / 32,
    file: path.join(outputFolder, `${newName}_lod2.glb`),
  });

  if (lod2res === null) return null;

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
    const lod1Name = crypto.randomUUID();

    const lod1res = await generateDocumentWorkerCall({
      cells: lod1cell,
      databasePath,
      hasAlphaEnabled,
      minVolume: 0.1,
      resizeFactor: 1 / 4,
      file: path.join(outputFolder, `${lod1Name}_lod1.glb`),
    });

    if (lod1res === null) continue;

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
      const newName = crypto.randomUUID();

      const lod0res = await generateDocumentWorkerCall({
        cells: lod0cell,
        databasePath,
        hasAlphaEnabled,
        minVolume: undefined,
        resizeFactor: 1,
        file: path.join(outputFolder, `${newName}_lod0.glb`),
      });

      if (lod0res === null) continue;

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
