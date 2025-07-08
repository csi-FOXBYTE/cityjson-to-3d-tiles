import { Logger } from "@gltf-transform/core";
import { parentPort } from "worker_threads";
import type { WorkerPayloads } from "./workerPaylod.js";
import { generateCell } from "./generateCell.js";
import { createDatabase } from "../database/index.js";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

if (!parentPort) throw new Error("Is not being called in a worker context!");

parentPort.on("message", async (value: WorkerPayloads) => {
  switch (value.type) {
    case "work": {
      try {
        const dbInstance = await createDatabase(value.data.databasePath);
        const result = await generateCell(
          value.data.cell,
          value.data.outputFolder,
          dbInstance
        );
        parentPort!.postMessage(result);
      } catch (e) {
        console.error(e);
        parentPort!.postMessage(null);
      }
      break;
    }
  }
});
