import { Logger } from "@gltf-transform/core";
import { cloneDocument, textureCompress } from "@gltf-transform/functions";
import { PromisePool } from "@supercharge/promise-pool/dist/index.js";
import { readFile } from "fs/promises";
import { glob } from "glob";
import path, { join } from "path";
import sharp from "sharp";
import { Worker } from "worker_threads";
import { getIO } from "../3dtiles/io.js";
import { createDatabase } from "../database/index.js";
import { compressBasisUniversal } from "../functions/compressBasisUniversal.js";
import { buildGeometry } from "./buildGeometry.js";
import { convertEPSGFromCityJSONToProj4 } from "./helpers.js";
import type { CityJSONV201 } from "./schemas/cityjson.js";
import { WorkerWorkPayload, WorkerWorkReturnType } from "./workerPayload.js";
import { WorkerPool } from "./workerPool.js";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

export async function generateTileDatabaseFromCityJSON(
  inputFolder: string,
  outputFolder: string,
  appearance: string,
  onProgress: (progress: number) => void,
  opts: {
    threadCount?: number;
    srcSRS?: string;
  } = {}
) {
  const { threadCount = 4 } = opts;

  const files = await glob("**/*.json", {
    absolute: true,
    cwd: inputFolder,
  });

  const fileWithTextureFolders = files.map((file) => ({
    folderPath: path.dirname(file),
    inputFile: file,
  }));

  const dbFilePath = path.join(outputFolder, `tmp-db.bin`);

  const dbInstance = await createDatabase(dbFilePath, true);

  const workerPool = new WorkerPool(
    () => new Worker(new URL("./worker.js", import.meta.url)),
    threadCount
  );

  const io = await getIO();

  const names = new Set<string>();

  const globalTextureSet = new Set<string>();

  let lastSrcSRSProj4: string | null = null;

  let index = 0;

  for (const { inputFile, folderPath } of fileWithTextureFolders) {
    const cityJsonRaw = await readFile(inputFile);

    const cityJsonRawString = cityJsonRaw.toString();

    const cityJson = JSON.parse(cityJsonRawString) as CityJSONV201;

    let srcSrsProj4: string | null = lastSrcSRSProj4;

    try {
      srcSrsProj4 = convertEPSGFromCityJSONToProj4(
        cityJson.metadata?.referenceSystem ?? opts.srcSRS
      );
    } catch (e) {
      console.error(e);
    }

    lastSrcSRSProj4 ??= srcSrsProj4;

    if (!srcSrsProj4)
      throw new Error("No valid src srs found please provide one!");

    const cityObjects = Object.entries(cityJson.CityObjects);

    const templates = cityJson["geometry-templates"]?.templates ?? [];
    const templateVertices =
      cityJson["geometry-templates"]?.["vertices-templates"] ?? [];

    const preparedGeometryTemplateInsert = await dbInstance.prepare(
      "INSERT INTO instancedData (arrayIndex, srcSRS, doc, id, filePath) VALUES (?, ?, ?, ?, ?)"
    );

    for (let i = 0; i < templates.length; i++) {
      const result = await buildGeometry({
        geometry: [templates[i]],
        vertices: templateVertices,
        id: i.toString(),
        cityJson: cityJson,
        src: srcSrsProj4,
        dest: "+proj=geocent +datum=WGS84 +units=m +no_defs +type=crs",
        folderPath,
        appearance,
        noTransform: true,
        dbInstance: dbInstance,
      });

      if (result.length !== 1) throw new Error("Unexpected!");

      const doc0 = await io.readBinary(result[0].serializedDoc!);

      await preparedGeometryTemplateInsert.bind({
        1: i.toString(),
        2: srcSrsProj4,
        3: await io.writeBinary(doc0),
        4: [crypto.randomUUID(), crypto.randomUUID()].join("-"),
        5: inputFile,
      });

      await preparedGeometryTemplateInsert.run();
    }

    await preparedGeometryTemplateInsert.finalize();

    await workerPool.messageWorkers({
      type: "init",
      data: {
        cityJsonRaw: cityJsonRawString,
        src: srcSrsProj4,
        dbFile: dbFilePath,
        filePath: inputFile,
      },
    });

    await PromisePool.withConcurrency(threadCount)
      .for(cityObjects)
      .process(async ([id, cityObject]) => {
        const result = await workerPool.run<
          WorkerWorkPayload,
          WorkerWorkReturnType
        >({
          type: "work",
          data: {
            id,
            folderPath,
            appearance,
          },
        });

        try {
          const preparedGeometryInsert = await dbInstance.prepare(
            `INSERT INTO data (name, childrenIds, parentIds, address, attributes, type, bbMinX, bbMinY, bbMinZ, bbMaxX, bbMaxY, bbMaxZ, doc, isInstanced, refId, transformationMatrix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );

          for (const part of result) {
            const id = part.id ?? crypto.randomUUID();
            if (names.has(id)) console.error("ERROR" + id);
            names.add(id);
            await preparedGeometryInsert.bind({
              1: id,
              2: cityObject.children?.join("_#,#_"),
              3: cityObject.parents?.join("_#,#_"),
              4: JSON.stringify(cityObject.address ?? {}),
              5: JSON.stringify(cityObject.attributes ?? {}),
              6: cityObject.type,
              7: part.cartographicBoxMinX,
              8: part.cartographicBoxMinY,
              9: part.cartographicBoxMinZ,
              10: part.cartographicBoxMaxX,
              11: part.cartographicBoxMaxY,
              12: part.cartographicBoxMaxZ,
              13: part.serializedDoc,
              14: part.isInstanced ? 1 : 0,
              15: part.refId,
              16: part.transformationMatrix?.join("@"),
            });

            await preparedGeometryInsert.run();

            const preparedTextureInsert = await dbInstance.prepare(
              `INSERT INTO textures (img, path) VALUES (?, ?)`
            );

            for (const texturePath of part.texturePaths) {
              if (globalTextureSet.has(texturePath)) continue;

              if (texturePath === "UNTEXTURED") continue;

              globalTextureSet.add(texturePath);

              const img = await readFile(join(folderPath, texturePath));

              await preparedTextureInsert.bind({
                1: img,
                2: texturePath,
              });

              await preparedTextureInsert.run();
            }

            for (const { buffer, name } of part.collectedTextures) {
              await preparedTextureInsert.bind({
                1: buffer,
                2: name,
              });

              await preparedTextureInsert.run();
            }
          }

          await preparedGeometryInsert.finalize();
        } catch (e) {
          console.error("SOMETHING WENT WRONG!!!");
          console.error("SOMETHING WENT WRONG!!!");
          console.error("SOMETHING WENT WRONG!!!");
          console.error(e);
          console.error("SOMETHING WENT WRONG!!!");
          console.error("SOMETHING WENT WRONG!!!");
          console.error("SOMETHING WENT WRONG!!!");
        }
      });

    index++;

    onProgress(index / files.length);
  }

  return { dbFilePath };
}
