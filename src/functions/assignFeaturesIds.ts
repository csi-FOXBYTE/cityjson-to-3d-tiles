import { Document, Primitive } from "@gltf-transform/core";
import { EXTMeshFeatures } from "../EXTMeshFeatures/EXTMeshFeatures.js";
import {
  EXTStructuralMetadata,
  SchemaDef,
} from "../EXTMeshFeatures/EXTStructuralMetadata.js";
import { StructuralMetadataPropertyTables } from "../EXTMeshFeatures/StructuralMetadataPropertyTables.js";
import { BinaryPropertyTableBuilder } from "../EXTMeshFeatures/BinaryPropertyTableBuilder.js";

export async function assignFeatureIds(
  document: Document,
  ids: string[],
  attributes: Record<string, any>[]
) {
  const root = document.getRoot();

  const extensionMeshFeatures = document.createExtension(EXTMeshFeatures);

  const buffer = document.getRoot().listBuffers()[0];

  const primitives: Primitive[] = [];

  for (const scene of root.listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh();

      if (!mesh) return;

      primitives.push(...mesh.listPrimitives());
    });
  }

  const extensionStructuralMetadata = document.createExtension(
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

  for (const attribute of attributes) {
    for (const key of Object.keys(attribute)) {
      schema.classes!.tree!.properties![key] = {
        name: key,
        type: "STRING",
      };
      necessaryProperties.add(key);
    }
  }

  const properties: Record<string, any[]> = {};

  for (const attribute of attributes) {
    for (const key of necessaryProperties.values()) {
      if (!properties[key]) properties[key] = [];
      properties[key].push(String(attribute[key] ?? "-"));
    }
  }

  const binaryPropertyTable = BinaryPropertyTableBuilder.create(
    schema,
    "tree",
    "Property Table"
  )
    .addProperty("id", ids)
    .addProperties(properties)
    .build();

  const propertyTable = StructuralMetadataPropertyTables.create(
    extensionStructuralMetadata,
    binaryPropertyTable
  );

  const structuralMetadata = extensionStructuralMetadata
    .createStructuralMetadata()
    .addPropertyTable(propertyTable)
    .setSchema(extensionStructuralMetadata.createSchemaFrom(schema));

  root.setExtension("EXT_structural_metadata", structuralMetadata);

  for (const element of primitives) {
    const primitive = element;

    const texcoords1 = primitive.getAttribute("TEXCOORD_1")?.getArray();

    if (!texcoords1) continue;

    const ids = texcoords1;

    const accessor = document
      .createAccessor()
      .setType("SCALAR")
      .setBuffer(buffer)
      .setNormalized(false)
      .setArray(new Int16Array(ids));

    const attributeNumber = 0;

    primitive.setAttribute(`_FEATURE_ID_${attributeNumber}`, accessor);

    const featureIdFromAttribute = extensionMeshFeatures
      .createFeatureId()
      .setFeatureCount(propertyTable.getCount())
      .setPropertyTable(propertyTable)
      .setAttribute(attributeNumber);

    const meshFeatures = extensionMeshFeatures.createMeshFeatures();

    meshFeatures.addFeatureId(featureIdFromAttribute);

    primitive.setExtension("EXT_mesh_features", meshFeatures);

    primitive.setAttribute("TEXCOORD_1", null);
  }
}
