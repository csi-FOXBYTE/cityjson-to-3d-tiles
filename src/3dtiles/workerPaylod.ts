import type { GridItem, Tile } from "./types.js";

export type WorkerPayloads = WorkerWorkPayload;

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
