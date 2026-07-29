import { createDatabase } from "../database/index.js";
import { generateDocument } from "./generateDocument.js";
import type { GridItem } from "./types.js";
import { writeFile } from "fs/promises";
import { getIO } from "./io.js";
import type { NodeIO } from "@gltf-transform/core";
import type { Database } from "sqlite";
import sharp from "sharp";
import { disposeDocument } from "../functions/disposeDocument.js";

sharp.concurrency(1);
sharp.cache(false);

export type GenerateDocumentWorkerPayload = {
  cells: { data: GridItem }[];
  databasePath: string;
  hasAlphaEnabled: boolean;
  minVolume?: number;
  resizeFactor?: number;
  file: string;
};

export type GenerateDocumentWorkerReturnType = {
  localBBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  rss: number;
} | null;

let database: Database | null;
async function getCachedDatabase(databasePath: string) {
  if (!database) database = await createDatabase(databasePath);

  return database;
}

let io: NodeIO | null;
async function getCachedIO() {
  if (!io) io = await getIO();

  return io;
}

process.on("message", async (data: GenerateDocumentWorkerPayload) => {
  try {
    const database = await getCachedDatabase(data.databasePath);

    const io = await getCachedIO();

    const result = await generateDocument(
      data.cells,
      database,
      io,
      data.hasAlphaEnabled,
      data.minVolume,
      data.resizeFactor
    );

    if (!result) return process.send?.(null);

    try {
      await writeFile(data.file, await io.writeBinary(result.document));

      process.send?.(
        ({
          localBBox: {
            min: {
              x: result.localBBox.min.x,
              y: result.localBBox.min.y,
              z: result.localBBox.min.z,
            },
            max: {
              x: result.localBBox.max.x,
              y: result.localBBox.max.y,
              z: result.localBBox.max.z,
            },
          },
          rss: process.memoryUsage().rss,
        }) satisfies GenerateDocumentWorkerReturnType
      );
    } finally {
      disposeDocument(result.document);
    }
  } catch (e) {
    console.error(e);
    process.send?.(null);
  }
});
