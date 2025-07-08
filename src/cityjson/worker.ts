import type { CityJSONV201 } from "./schemas/cityjson.js";
import { Logger } from "@gltf-transform/core";
import { parentPort } from "worker_threads";
import type { WorkerPayloads } from "./workerPayload.js";
import { buildGeometry } from "./buildGeometry.js";
import { createDatabase } from "../database/index.js";
import { Database } from "sqlite";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

if (!parentPort) throw new Error("Is not being called in a worker context!");

let cityJson: CityJSONV201;
let src = "";
const dest = "+proj=geocent +datum=WGS84 +units=m +no_defs +type=crs";
let dbInstance: Database | null = null;

parentPort.on("message", async (value: WorkerPayloads) => {
  try {
    switch (value.type) {
      case "init":
        cityJson = JSON.parse(value.data.cityJsonRaw) as CityJSONV201;
        src = value.data.src;
        dbInstance = await createDatabase(value.data.dbFile);
        parentPort?.postMessage("");
        break;
      case "work": {
        try {
          if (!dbInstance) throw new Error("DB Instance not initialized!");
          const result = await buildGeometry({
            geometry: cityJson!.CityObjects![value.data.id]!.geometry,
            vertices: cityJson.vertices,
            id: value.data.id,
            cityJson,
            src,
            dest,
            folderPath: value.data.folderPath,
            appearance: value.data.appearance,
            noTransform: false,
            dbInstance,
          });
          parentPort!.postMessage(result);
          break;
        } catch (e) {
          console.error(e);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
});
