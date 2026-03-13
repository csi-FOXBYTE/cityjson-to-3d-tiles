import sharp from "sharp";

sharp.concurrency(1);
sharp.cache(false);

import { Logger } from "@gltf-transform/core";
import { generateCell } from "./generateCell.js";
import type { GridItem, Tile } from "./types.js";


Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

export type WorkerWorkPayload = {
  type: "work";
  data: {
    cell: {
      data: GridItem;
      x: number;
      y: number;
    }[];
    hasAlphaEnabled: boolean;
    outputFolder: string;
    databasePath: string;
  };
};

export type WorkerWorkReturnType = { tile: Tile, files: string[], heapUsed: number } | null;

process.on("message", async (value: WorkerWorkPayload) => {
  try {
    const result = await generateCell(
      value.data.cell,
      value.data.outputFolder,
      value.data.databasePath,
      value.data.hasAlphaEnabled
    );

    process.send?.(result satisfies WorkerWorkReturnType);
  } catch (e) {
    console.error(e);
    process.send?.(null);
  }
});
