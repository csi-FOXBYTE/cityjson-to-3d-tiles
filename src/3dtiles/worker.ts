import { Logger } from "@gltf-transform/core";
import { parentPort } from "worker_threads";
import type { WorkerPayloads } from "./workerPaylod.js";
import { generateCell } from "./generateCell.js";
import { createDatabase } from "../database/index.js";
import { Database } from "sqlite";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

if (!parentPort) throw new Error("Is not being called in a worker context!");

let dbInstance: Database | null = null;

parentPort.on("message", async (value: WorkerPayloads) => {
  switch (value.type) {
    case "init": {
      dbInstance = await createDatabase(value.data.databasePath);
      parentPort!.postMessage(null);
      break;
    };
    case "work": {
      try {
        if (!dbInstance) throw new Error("Workers not initialized!");

        const result = await generateCell(
          value.data.cell,
          value.data.outputFolder,
          dbInstance,
          value.data.hasAlphaEnabled,
        );

        parentPort!.postMessage(result);
      } catch (e) {
        console.error(e);
        parentPort!.postMessage(null);
      }
      break;
    }
    case "terminate": {
      await dbInstance?.close();
      parentPort!.postMessage(null);
      break;
    }
  }
});
