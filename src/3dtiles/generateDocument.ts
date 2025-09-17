import { Document, Logger, NodeIO } from "@gltf-transform/core";
import {
  dedup,
  draco,
  flatten,
  join,
  mergeDocuments,
  prune,
  simplify,
  unpartition,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import proj4 from "proj4";
import { Database } from "sqlite";
import { Box3, Matrix4, Vector3 } from "three";
import { assignFeatureIdToTexCoord2 } from "../functions/assignFeatureIdToTexCoord2.js";
import { assignFeatureIds } from "../functions/assignFeaturesIds.js";
import { compressBasisUniversal } from "../functions/compressBasisUniversal.js";
import { getTextures } from "../functions/getTextures.js";
import { mergeTextures } from "../functions/mergeTextures.js";
import { getIO } from "./io.js";
import type { GridItem } from "./types.js";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

const cesiumCartographic = "+proj=longlat +datum=WGS84 +no_defs +type=crs";
const cesiumCartesian =
  "+proj=geocent +datum=WGS84 +units=m +no_defs +type=crs";

const cesiumCartesianToCartographicTransform = proj4(
  cesiumCartesian,
  cesiumCartographic
);

async function getDocument(dbInstance: Database, name: string, io: NodeIO) {
  const row = await dbInstance.get(
    `SELECT doc, isInstanced, transformationMatrix, refId FROM data WHERE name = ?`,
    [name]
  );

  if (!row) throw new Error(`No CityObject found with name "${name}"`);

  let rowDoc: Buffer;

  if (row.isInstanced) {
    const instancedRow = await dbInstance.get(
      `SELECT doc FROM instancedData WHERE id = ?`,
      [row.refId]
    );

    rowDoc = instancedRow.doc;
  } else {
    rowDoc = row.doc;
  }

  if (!rowDoc)
    throw new Error(
      `CityObject with name "${name}" has no associated document!`
    );

  const document = await io.readBinary(new Uint8Array(rowDoc));

  if (row.isInstanced) {
    const transformationMatrix = new Matrix4().fromArray(
      (row.transformationMatrix as string).split("@").map((a) => parseFloat(a))
    );
    document
      .getRoot()
      .listScenes()[0]
      .listChildren()[0]
      .setMatrix(transformationMatrix.toArray());
  }

  return document;
}

function createFilterFn(minVolume?: number) {
  if (!minVolume) return () => true;

  return (cell: { data: GridItem }) => {
    const [minCX, minCY, minCZ] =
      cesiumCartesianToCartographicTransform.inverse([
        cell.data.minX,
        cell.data.minY,
        cell.data.minHeight,
      ]);
    const [maxCX, maxCY, maxCZ] =
      cesiumCartesianToCartographicTransform.inverse([
        cell.data.maxX,
        cell.data.maxY,
        cell.data.maxHeight,
      ]);

    const bbox = new Box3(
      new Vector3(minCX, minCY, minCZ),
      new Vector3(maxCX, maxCY, maxCZ)
    );

    const size = new Vector3();

    bbox.getSize(size);

    return size.x * size.y * size.z > minVolume;
  };
}

export async function generateDocument(
  cells: { data: GridItem }[],
  dbInstance: Database,
  hasAlphaEnabled: boolean,
  minVolume?: number,
  resizeFactor?: number
) {
  if (cells.length === 0) return null;

  const io = await getIO();

  const localBBox = new Box3();

  cells.forEach((p) => {
    localBBox.expandByPoint(
      new Vector3(p.data.minX, p.data.minY, p.data.minHeight)
    );
    localBBox.expandByPoint(
      new Vector3(p.data.maxX, p.data.maxY, p.data.maxHeight)
    );
  });

  const filteredCell = cells.filter(createFilterFn(minVolume));

  if (filteredCell.length === 0)
    return {
      localBBox,
      document: new Document(),
    };

  const rootDocument = await getDocument(
    dbInstance,
    filteredCell[0].data.name,
    io
  );

  await getTextures(rootDocument, dbInstance);

  assignFeatureIdToTexCoord2(rootDocument, 0);

  for (let i = 1; i < filteredCell.length; i++) {
    const c = filteredCell[i];

    localBBox.union(
      new Box3(
        new Vector3(
          filteredCell[i].data.minX,
          filteredCell[i].data.minY,
          filteredCell[i].data.minHeight
        ),
        new Vector3(
          filteredCell[i].data.maxX,
          filteredCell[i].data.maxY,
          filteredCell[i].data.maxHeight
        )
      )
    );

    const document = await getDocument(dbInstance, c.data.name, io);

    await getTextures(document, dbInstance);

    assignFeatureIdToTexCoord2(document, i);

    const map = mergeDocuments(rootDocument, document);

    const sceneA = rootDocument.getRoot().listScenes()[0];

    const sceneB = map.get(document.getRoot().listScenes()[0]);

    const rootNode = rootDocument.createNode().setName("SceneB");

    // @ts-ignore
    for (const node of sceneB!.listChildren()) {
      rootNode.addChild(node);
    }

    sceneA.addChild(rootNode);
    sceneB!.dispose();
  }

  await mergeTextures(rootDocument, resizeFactor);

  await rootDocument.transform(
    dedup(),
    flatten(),
    weld({}),
    join({}),
    unpartition(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: 0.0,
      error: 0.001,
    }),
    draco({})
  );

  await compressBasisUniversal(rootDocument);

  await assignFeatureIds(
    rootDocument,
    filteredCell.map((c) => c.data.name),
    filteredCell.map((c) => c.data.attributes)
  );

  rootDocument
    .getRoot()
    .listMaterials()
    .forEach((material) => {
      if (material.getBaseColorTexture() === null) {
        material.setAlphaMode("OPAQUE");

        return;
      }

      material.setAlphaMode(hasAlphaEnabled ? "OPAQUE" : "BLEND");
    });

  await rootDocument.transform(prune());

  return { document: rootDocument, localBBox };
}
