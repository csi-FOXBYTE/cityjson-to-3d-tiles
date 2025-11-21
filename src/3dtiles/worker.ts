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

export type WorkerWorkReturnType = Tile | null;

process.on("message", async (value: WorkerWorkPayload) => {
  try {
    const result = await generateCell(
      value.data.cell,
      value.data.outputFolder,
      value.data.databasePath,
      value.data.hasAlphaEnabled
    );

    process.send?.(result satisfies WorkerWorkReturnType);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.send?.(null);
    process.exit(1);
  }
});
