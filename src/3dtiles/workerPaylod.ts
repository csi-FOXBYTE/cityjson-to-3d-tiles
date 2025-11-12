import type { GridItem, Tile } from "./types.js";

export type WorkerPayloads = WorkerWorkPayload | WorkerTerminatePayload | WorkerInitPayload;

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
  };
};

export type WorkerTerminatePayload = {
  type: "terminate";
};

export type WorkerInitPayload = {
  type: "init";
  data: {
    databasePath: string;
  }
};



export type WorkerWorkReturnType = Tile | null;
