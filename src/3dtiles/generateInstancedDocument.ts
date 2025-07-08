import { Document, Logger, Scene } from "@gltf-transform/core";
import { EXTMeshGPUInstancing } from "@gltf-transform/extensions";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type { GridItem } from "./types.js";

import {
  draco,
  flatten,
  mergeDocuments,
  prune,
  unpartition,
} from "@gltf-transform/functions";
import { EXTInstanceFeatures } from "../EXTMeshFeatures/EXTInstanceFeatures.js";
import {
  EXTStructuralMetadata,
  SchemaDef,
} from "../EXTMeshFeatures/EXTStructuralMetadata.js";
import { BinaryPropertyTableBuilder } from "../EXTMeshFeatures/BinaryPropertyTableBuilder.js";
import { StructuralMetadataPropertyTables } from "../EXTMeshFeatures/StructuralMetadataPropertyTables.js";
import { Database } from "sqlite";
import { getIO } from "./io.js";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

export async function generateInstancedDocument(
  cells: { data: GridItem }[],
  dbInstance: Database,
  lodLevel: 0 | 1 | 2 = 0
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

  const usedInstanceMap = new Map<string, Document>();

  const transformationMatricesPerInstanceMap = new Map<
    string,
    {
      position: Vector3;
      rotation: Quaternion;
      scale: Vector3;
      gridItem: GridItem;
    }[]
  >();
  for (const cell of cells) {
    const row = await dbInstance.get(
      `SELECT doc, isInstanced, transformationMatrix, refId from data WHERE name = ?`,
      [cell.data.name]
    );

    if (!row)
      throw new Error(`No CityObject found with name "${cell.data.name}"`);

    if (!row.refId)
      throw new Error(
        `CityObject with name "${cell.data.name}" has no associated refId!`
      );

    if (!transformationMatricesPerInstanceMap.has(row.refId))
      transformationMatricesPerInstanceMap.set(row.refId, []);

    const matrix = new Matrix4().fromArray(
      (row.transformationMatrix as string).split("@").map((a) => parseFloat(a))
    );

    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();

    matrix.decompose(position, rotation, scale);

    transformationMatricesPerInstanceMap.get(row.refId)!.push({
      position,
      rotation,
      scale,
      gridItem: cell.data,
    });

    if (usedInstanceMap.has(row.refId)) continue;

    const instanceRow = await dbInstance.get(
      `SELECT doc${lodLevel} AS doc FROM instancedData WHERE id = ?`,
      [row.refId]
    );

    if (!instanceRow)
      throw new Error(`No CityObject found with name "${cell.data.name}"`);

    if (!instanceRow.doc)
      throw new Error(
        `CityObject with name "${cell.data.name}" has no associated doc!`
      );

    const document = await io.readBinary(instanceRow.doc);

    document
      .getRoot()
      .listMaterials()
      .forEach((material) => {
        material.setAlphaMode("BLEND");
      });

    usedInstanceMap.set(row.refId, document);
  }

  const usedInstances = Array.from(usedInstanceMap.entries()).reverse();

  const [refId, rootDocument] = usedInstances[0];

  const rootTranslations = transformationMatricesPerInstanceMap
    .get(refId)!
    .map(({ position }) => position);

  const centroid = new Vector3();

  rootTranslations.forEach((t) => centroid.add(t));

  centroid.divideScalar(rootTranslations.length);

  rootDocument.getRoot().listNodes()[0].setTranslation(centroid.toArray());

  const batchExtension = rootDocument
    .createExtension(EXTMeshGPUInstancing)
    .setRequired(true);

  const batchPositions = rootDocument
    .createAccessor("instance_positions")
    .setArray(
      new Float32Array(
        transformationMatricesPerInstanceMap
          .get(refId)!
          .flatMap(({ position }) => position.clone().sub(centroid).toArray())
      )
    )
    .setType("VEC3");

  const batchRotations = rootDocument
    .createAccessor("instance_rotations")
    .setArray(
      new Float32Array(
        transformationMatricesPerInstanceMap
          .get(refId)!
          .flatMap(({ rotation }) => rotation.toArray())
      )
    )
    .setType("VEC4");

  const batchScales = rootDocument
    .createAccessor("instance_scales")
    .setArray(
      new Float32Array(
        transformationMatricesPerInstanceMap
          .get(refId)!
          .flatMap(({ scale }) => scale.toArray())
      )
    )
    .setType("VEC3");

  let walkingId = 0;

  const batchIds = rootDocument
    .createAccessor("instance_ids")
    .setArray(
      new Uint16Array(
        transformationMatricesPerInstanceMap.get(refId)!.map(() => walkingId++)
      )
    )
    .setType("SCALAR");

  const batch = batchExtension
    .createInstancedMesh()
    .setAttribute("TRANSLATION", batchPositions)
    .setAttribute("ROTATION", batchRotations)
    .setAttribute("SCALE", batchScales)
    .setAttribute("_FEATURE_ID_0", batchIds);

  // structural metadata

  const structuralMetadataExtension = rootDocument.createExtension(
    EXTStructuralMetadata
  );

  const schema: SchemaDef = {
    id: "schema_01",
    name: "Schema 01",
    description: "An example schema",
    version: "1.0.0",
    enums: {},
    classes: {
      tree: {
        name: "Tree",
        description: "Jo",
        properties: {
          id: {
            name: "ID",
            type: "STRING",
          },
        },
      },
    },
  };

  const necessaryProperties = new Set<string>();

  for (const attributes of Array.from(
    transformationMatricesPerInstanceMap.values()
  ).flatMap((d) => d.map((b) => b.gridItem.attributes))) {
    for (const [key] of Object.entries(attributes)) {
      schema.classes!.tree!.properties![key] = {
        name: key,
        type: "STRING",
      };
      necessaryProperties.add(key);
    }
  }

  const structuralMetadata = structuralMetadataExtension
    .createStructuralMetadata()
    .setSchema(structuralMetadataExtension.createSchemaFrom(schema));

  const properties: Record<string, any[]> = {};

  Array.from(transformationMatricesPerInstanceMap.values()).forEach((d) =>
    d.forEach((d) => {
      for (const key of necessaryProperties.values()) {
        if (!properties[key]) properties[key] = [];
        properties[key].push(String(d.gridItem.attributes[key] ?? "-"));
      }
    })
  );

  const binaryPropertyTable = BinaryPropertyTableBuilder.create(
    schema,
    "tree",
    "Property Table"
  )
    .addProperty(
      "id",
      Array.from(transformationMatricesPerInstanceMap.values()).flatMap((d) =>
        d.map((d) => d.gridItem.name)
      )
    )
    .addProperties(properties)
    .build();

  const propertyTable = StructuralMetadataPropertyTables.create(
    structuralMetadataExtension,
    binaryPropertyTable
  );

  structuralMetadata.addPropertyTable(propertyTable);

  rootDocument
    .getRoot()
    .setExtension("EXT_structural_metadata", structuralMetadata);

  // instance features

  const instanceFeaturesExtension =
    rootDocument.createExtension(EXTInstanceFeatures);

  const featureIdFromAttribute = instanceFeaturesExtension
    .createFeatureId()
    .setAttribute(0)
    .setPropertyTable(propertyTable)
    .setFeatureCount(new Set(batchIds.getArray()).size);

  const instanceFeatures = instanceFeaturesExtension
    .createInstanceFeatures()
    .addFeatureId(featureIdFromAttribute);

  rootDocument
    .getRoot()
    .listNodes()[0]
    .setExtension("EXT_mesh_gpu_instancing", batch)
    .setExtension("EXT_instance_features", instanceFeatures);

  for (const [refId, document] of usedInstances.slice(1)) {
    const map = mergeDocuments(rootDocument, document);

    const sceneA = rootDocument.getRoot().listScenes()[0];

    const sceneB = map.get(document.getRoot().listScenes()[0]) as Scene;

    const rootNode = rootDocument.createNode().setName("SceneB");

    if (sceneB.listChildren().length !== 1)
      throw new Error("Instanced mesh should only have 1 node!");

    const newNode = rootNode.addChild(sceneB.listChildren()[0]).setName(refId);

    const rootTranslations = transformationMatricesPerInstanceMap
      .get(refId)!
      .map(({ position }) => position);

    const centroid = new Vector3();

    rootTranslations.forEach((t) => centroid.add(t));

    centroid.divideScalar(rootTranslations.length);

    const originalTranslation = newNode.getTranslation();

    newNode
      .listChildren()[0]
      .setTranslation([
        originalTranslation[0] + centroid.x,
        originalTranslation[1] + centroid.y,
        originalTranslation[2] + centroid.z,
      ]);

    const batchPositions = rootDocument
      .createAccessor("instance_positions")
      .setArray(
        new Float32Array(
          transformationMatricesPerInstanceMap
            .get(refId)!
            .flatMap(({ position }) => position.clone().sub(centroid).toArray())
        )
      )
      .setType("VEC3");

    const batchRotations = rootDocument
      .createAccessor("instance_rotations")
      .setArray(
        new Float32Array(
          transformationMatricesPerInstanceMap
            .get(refId)!
            .flatMap(({ rotation }) => rotation.toArray())
        )
      )
      .setType("VEC4");

    const batchScales = rootDocument
      .createAccessor("instance_scales")
      .setArray(
        new Float32Array(
          transformationMatricesPerInstanceMap
            .get(refId)!
            .flatMap(({ scale }) => scale.toArray())
        )
      )
      .setType("VEC3");

    const batchIds = rootDocument
      .createAccessor("instance_ids")
      .setArray(
        new Uint16Array(
          transformationMatricesPerInstanceMap
            .get(refId)!
            .map(() => walkingId++)
        )
      )
      .setType("SCALAR");

    const batch = batchExtension
      .createInstancedMesh()
      .setAttribute("TRANSLATION", batchPositions)
      .setAttribute("ROTATION", batchRotations)
      .setAttribute("SCALE", batchScales)
      .setAttribute("_FEATURE_ID_0", batchIds);

    const featureIdFromAttribute = instanceFeaturesExtension
      .createFeatureId()
      .setAttribute(0)
      .setPropertyTable(propertyTable)
      .setFeatureCount(new Set(batchIds.getArray()).size);

    const instanceFeatures = instanceFeaturesExtension
      .createInstanceFeatures()
      .addFeatureId(featureIdFromAttribute);

    newNode
      .listChildren()[0]
      .setExtension("EXT_mesh_gpu_instancing", batch)
      .setExtension("EXT_instance_features", instanceFeatures);

    sceneA.addChild(newNode);
    sceneB.dispose();
  }

  await rootDocument.transform(
    // dedup(),
    flatten(),
    unpartition(),
    prune(),
    draco({
      method: "edgebreaker",
      quantizationVolume: "mesh",
    })
  );

  return { document: rootDocument, localBBox };
}
