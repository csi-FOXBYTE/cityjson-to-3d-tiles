import { mkdir, rm, writeFile } from "fs/promises";
import { Box2, Box3, Vector2, Vector3 } from "three";
import { Cartographic } from "cesium";
import { Worker } from "worker_threads";
import { PromisePool } from "@supercharge/promise-pool/dist/index.js";
import { Grid2D } from "../grid2d/index.js";
import type { GridItem, Tile } from "../3dtiles/types.js";
import { calculateBBoxVolume } from "./calculateBoundingVolume.js";
import { WorkerPool } from "../cityjson/workerPool.js";
import type {
  WorkerInitPayload,
  WorkerTerminatePayload,
  WorkerWorkPayload,
  WorkerWorkReturnType,
} from "./workerPaylod.js";
import { createDatabase } from "../database/index.js";
import path from "path";

export async function generate3DTilesFromTileDatabase(
  dbFilePath: string,
  outputFolder: string,
  hasAlphaEnabled: boolean,
  onProgress: (progress: number) => void,
  opts: {
    threadCount?: number;
  } = {}
) {
  try {
    await rm(outputFolder, {
      force: true,
      recursive: true,
    });
  } catch { }
  try {
    await mkdir(outputFolder, { recursive: true });
  } catch { }
  const { threadCount = 4 } = opts;

  const children: GridItem[] = [];

  const globalBoundingBox = new Box3();

  const dbInstance = await createDatabase(dbFilePath, false);

  await dbInstance.each(
    "SELECT name, bbMinX, bbMinY, bbMinZ, bbMaxX, bbMaxY, isInstanced, bbMaxZ, attributes, type FROM data",
    (err, row) => {
      const minC = new Cartographic(row.bbMinX, row.bbMinY, row.bbMinZ);
      const maxC = new Cartographic(row.bbMaxX, row.bbMaxY, row.bbMaxZ);

      const bbox = new Box3(
        new Vector3(minC.longitude, minC.latitude, minC.height),
        new Vector3(maxC.longitude, maxC.latitude, maxC.height)
      );

      globalBoundingBox.union(bbox);

      const name = row.name;

      children.push({
        minX: minC.longitude,
        maxX: maxC.longitude,
        minY: minC.latitude,
        maxY: maxC.latitude,
        name,
        isInstanced: row.isInstanced === 1,
        minHeight: minC.height,
        maxHeight: maxC.height,
        attributes: JSON.parse(row.attributes ?? {}),
        type: row.type,
        region: [
          minC.longitude,
          minC.latitude,
          maxC.longitude,
          maxC.latitude,
          minC.height,
          maxC.height,
        ],
      });
    }
  );

  try {
    await dbInstance.close();
  } catch (e) {
    console.error(e);
  }

  const rootTile: Tile = {
    refine: "ADD",
    geometricError: calculateBBoxVolume(globalBoundingBox),
    boundingVolume: {
      region: [
        globalBoundingBox.min.x,
        globalBoundingBox.min.y,
        globalBoundingBox.max.x,
        globalBoundingBox.max.y,
        globalBoundingBox.min.z,
        globalBoundingBox.max.z,
      ],
    },
    children: [],
  };

  const grid = new Grid2D<GridItem>(
    new Box2(
      new Vector2(globalBoundingBox.min.x, globalBoundingBox.min.y),
      new Vector2(globalBoundingBox.max.x, globalBoundingBox.max.y)
    ),
    0.0002
  );

  for (const item of children) {
    grid.add(
      (item.maxX - item.minX) * 0.5 + item.minX,
      (item.maxY - item.minY) * 0.5 + item.minY,
      item
    );
  }

  let index = 0;

  const workerPool = new WorkerPool(
    () => new Worker(new URL("./worker.js", import.meta.url)),
    threadCount
  );

  await workerPool.messageWorkers({ type: "init", data: { databasePath: dbFilePath } } satisfies WorkerInitPayload);

  await PromisePool.withConcurrency(threadCount)
    .for(grid.cells)
    .process(async (cell) => {
      try {
        const lod2Tile = await workerPool.run<
          WorkerWorkPayload,
          WorkerWorkReturnType
        >({
          data: {
            cell,
            outputFolder,
            hasAlphaEnabled,
          },
          type: "work",
        });

        if (!lod2Tile) return;

        rootTile.children!.push(lod2Tile);

        await writeFile(
          path.join(outputFolder, "tileset.json"),
          JSON.stringify(
            {
              asset: {
                version: "1.1",
              },
              geometricError: calculateBBoxVolume(globalBoundingBox),
              boundingVolume: {
                region: [
                  globalBoundingBox.min.x,
                  globalBoundingBox.min.y,
                  globalBoundingBox.max.x,
                  globalBoundingBox.max.y,
                  globalBoundingBox.min.z,
                  globalBoundingBox.max.z,
                ],
              },
              root: rootTile,
            },
            undefined,
            4
          )
        );
      } catch (e) {
        console.error(e);
      }
      index++;
      onProgress(index / grid.cells.length);
    });

  await workerPool.messageWorkers({ type: "terminate" } satisfies WorkerTerminatePayload);

  workerPool.terminate();

  await writeFile(
    path.join(outputFolder, "tileset.json"),
    JSON.stringify(
      {
        asset: {
          version: "1.1",
        },
        geometricError: calculateBBoxVolume(globalBoundingBox),
        boundingVolume: {
          region: [
            globalBoundingBox.min.x,
            globalBoundingBox.min.y,
            globalBoundingBox.max.x,
            globalBoundingBox.max.y,
            globalBoundingBox.min.z,
            globalBoundingBox.max.z,
          ],
        },
        root: rootTile,
      },
      undefined,
      4
    )
  );
}
