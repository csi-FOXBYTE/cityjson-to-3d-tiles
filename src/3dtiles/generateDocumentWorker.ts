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
  localBBox: Box3;
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
      result
        ? { localBBox: result?.localBBox }
        : (null satisfies GenerateDocumentWorkerReturnType)
    );

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
});
