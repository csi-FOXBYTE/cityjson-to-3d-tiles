import { Box3 } from "three";
import { createDatabase } from "../database/index.js";
import { generateDocument } from "./generateDocument.js";
import type { GridItem } from "./types.js";
import { writeFile } from "fs/promises";
import { getIO } from "./io.js";

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
} | null;

process.on("message", async (data: GenerateDocumentWorkerPayload) => {
  try {
    const database = await createDatabase(data.databasePath);

    const result = await generateDocument(
      data.cells,
      database,
      data.hasAlphaEnabled,
      data.minVolume,
      data.resizeFactor
    );

    if (result) {
      const io = await getIO();

      await writeFile(data.file, await io.writeBinary(result.document));
    }

    process.send?.(
      (result?.localBBox
        ? {
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
          }
        : null) satisfies GenerateDocumentWorkerReturnType
    );

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.send?.(null);
    process.exit(1);
  }
});
