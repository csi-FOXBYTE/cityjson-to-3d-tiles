import { Document, Texture } from "@gltf-transform/core";
import {
  dedup,
  flatten,
  join,
  normals,
  prune,
  weld,
} from "@gltf-transform/functions";
import { readFile } from "fs/promises";
import path from "path";
import proj4 from "proj4";
import { Database } from "sqlite";
import { Vector3 } from "three";
import { getIO } from "../3dtiles/io.js";
import { mergeTextures } from "../functions/mergeTextures.js";
import { padTextures } from "../functions/padTextures.js";
import { buildGeometryInstance } from "./buildGeometryInstance.js";
import { getBBoxesFromMeshes, triangulate3DPolygon } from "./helpers.js";
import type { CityJSONV201 } from "./schemas/cityjson.js";
import { WorkerWorkReturnType } from "./workerPayload.js";

export async function buildGeometry({
  appearance,
  cityJson,
  dest,
  folderPath,
  geometry,
  id,
  src,
  vertices,
  noTransform,
  dbInstance,
}: {
  geometry: CityJSONV201["CityObjects"][string]["geometry"];
  vertices: CityJSONV201["vertices"];
  id: string;
  cityJson: CityJSONV201;
  src: string;
  dest: string;
  folderPath: string;
  appearance: string;
  noTransform?: boolean;
  dbInstance: Database;
}): Promise<WorkerWorkReturnType> {
  if (!geometry) return [];

  const io = await getIO();

  const transform = proj4(src, dest);

  let globalTransformPoint: null | Vector3 = null;

  const result: WorkerWorkReturnType = [];

  for (let part of geometry) {
    if (part.type === "GeometryInstance") {
      result.push(
        ...(await buildGeometryInstance(
          id,
          cityJson,
          dest,
          part,
          io,
          dbInstance,
        )),
      );

      continue;
    }

    switch (part.type) {
      case "CompositeSolid":
        throw new Error("CompositeSolid not implemented yet!");
      case "MultiLineString":
        throw new Error("MultiLineString not implemented yet!");
      case "MultiPoint":
        throw new Error("MultiPoint not implemented yet!");
      case "MultiSolid":
        throw new Error("MultiSolid not implemented yet!");
      case "CompositeSurface":
      case "MultiSurface":
      case "Solid": {
        // only exterior shell for solids right now!

        if (part.type === "Solid" && part.boundaries.length > 1) {
          continue;
        }

        const hasTexture = part!.texture?.[appearance] !== undefined;

        const meshes: {
          position: Float32Array;
          indices: Int16Array;
          uvs: Float32Array;
          colors: Float32Array;
        }[] = [];

        const textureIdSet = new Set<number>();

        let texturePaths: string[] = [];

        let boundaries: [number, number, number][][] = [];
        let textureValues: number[][][] | null = null;

        // --- NEW: Semantic Variables ---
        let semanticValues: number[] | null = null;
        let semanticSurfaces: any[] | null = null;

        if (part.type === "Solid") {
          boundaries = part.boundaries[0];
          if (hasTexture) textureValues = part?.texture?.[appearance].values[0];

          // Get semantics for Solid (exterior shell)
          if (part.semantics) {
            semanticValues = part.semantics.values[0];
            semanticSurfaces = part.semantics.surfaces;
          }
        }
        if (part.type === "MultiSurface") {
          boundaries = part.boundaries;
          if (hasTexture) textureValues = part.texture?.[appearance].values;

          // Get semantics for MultiSurface
          if (part.semantics) {
            semanticValues = part.semantics.values;
            semanticSurfaces = part.semantics.surfaces;
          }
        }
        if (part.type === "CompositeSurface") {
          boundaries = part.boundaries;
          if (hasTexture) textureValues = part.texture?.[appearance].values;

          // Get semantics for CompositeSurface
          if (part.semantics) {
            semanticValues = part.semantics.values;
            semanticSurfaces = part.semantics.surfaces;
          }
        }

        const document = new Document();
        const root = document.getRoot();
        const scene = document.createScene();
        root.setDefaultScene(scene);
        const buffer = document.createBuffer();
        const node = document.createNode();
        scene.addChild(node);
        const m = document.createMesh();
        node.setMesh(m);

        for (let i = 0; i < boundaries.length; i++) {
          // IMPORTANT: Reset textureId for every surface.
          // If we don't, a previous wall texture might apply to a roof!
          let textureId: number | null = null;

          const surfaces = boundaries[i];
          const rings: [number, number, number][][] = [];
          const uvs: number[] = [];

          // --- NEW: Check for Roof Semantics ---
          let isRoof = false;
          if (semanticValues && semanticSurfaces) {
            const semanticIndex = semanticValues[i];
            // Verify index validity and type
            if (
              semanticIndex !== undefined &&
              semanticIndex !== null &&
              semanticSurfaces[semanticIndex]
            ) {
              if (semanticSurfaces[semanticIndex].type === "RoofSurface") {
                isRoof = true;
              }
            }
          }

          for (let j = 0; j < surfaces.length; j++) {
            const ring = surfaces[j];
            const verts: [number, number, number][] = [];

            for (const vertex of ring) {
              const vert = vertices[vertex];

              verts.push(vert);
            }

            if (hasTexture && (textureValues![i][j] ?? []).length > 1) {
              textureId = textureValues![i][j][0];
              textureIdSet.add(textureId);
              for (const uvIndex of textureValues![i][j].slice(1)) {
                const uv =
                  cityJson.appearance?.["vertices-texture"]![uvIndex!]!;
                uvs.push(uv[0], 1 - uv[1]);
              }
            }

            rings.push(verts);
          }

          const indices = triangulate3DPolygon(rings);

          const flatVertices = rings
            .flat()
            .flatMap((p) =>
              noTransform
                ? p
                : [
                    p[0] * cityJson.transform.scale[0] +
                      cityJson.transform.translate[0],
                    p[1] * cityJson.transform.scale[1] +
                      cityJson.transform.translate[1],
                    p[2] * cityJson.transform.scale[2] +
                      cityJson.transform.translate[2],
                  ],
            );

          if (!indices) continue;

          const position = new Array<number>(flatVertices.length);

          if (noTransform) {
            for (let i = 0; i < flatVertices.length; i += 3) {
              if (!globalTransformPoint)
                globalTransformPoint = new Vector3(
                  flatVertices[0],
                  flatVertices[1],
                  flatVertices[2],
                );

              position[i + 0] = flatVertices[i + 0] - globalTransformPoint.x;
              position[i + 1] = flatVertices[i + 1] - globalTransformPoint.y;
              position[i + 2] = flatVertices[i + 2] - globalTransformPoint.z; // convert to y up coordinate system
            }
          } else {
            for (let i = 0; i < flatVertices.length; i += 3) {
              const [x, y, z] = transform.forward([
                flatVertices[i + 0],
                flatVertices[i + 1],
                flatVertices[i + 2],
              ]);

              if (!globalTransformPoint)
                globalTransformPoint = new Vector3(x, y, z);

              position[i + 0] = x - globalTransformPoint.x;
              position[i + 1] = z - globalTransformPoint.z;
              position[i + 2] = -(y - globalTransformPoint.y); // convert to y up coordinate system
            }
          }

          // --- NEW: Generate Vertex Colors ---
          const vertexCount = position.length / 3;
          const colors = new Float32Array(vertexCount * 3);

          // Logic: Apply RED only if it is a Roof AND has NO texture
          const applyRed = isRoof && textureId === null;

          for (let k = 0; k < vertexCount; k++) {
            if (applyRed) {
              // Red [1, 0, 0]
              colors[k * 3 + 0] = 1.0;
              colors[k * 3 + 1] = 0.0;
              colors[k * 3 + 2] = 0.0;
            } else {
              // White [1, 1, 1] (Default/Neutral for textured surfaces)
              colors[k * 3 + 0] = 1.0;
              colors[k * 3 + 1] = 1.0;
              colors[k * 3 + 2] = 1.0;
            }
          }

          const material = document.createMaterial("UNTEXTURED");

          const primitive = document.createPrimitive();
          primitive.setMaterial(material);

          meshes.push({
            indices: new Int16Array(indices),
            position: new Float32Array(position),
            uvs: new Float32Array(uvs),
            colors: colors, // Store colors
          });

          const positionAccessor = document
            .createAccessor()
            .setBuffer(buffer)
            .setArray(new Float32Array(position))
            .setType("VEC3");

          // Add Color Accessor
          const colorAccessor = document
            .createAccessor()
            .setBuffer(buffer)
            .setArray(colors)
            .setType("VEC3");

          primitive.setAttribute("COLOR_0", colorAccessor);

          if (uvs.length !== 0) {
            const uvAccessor = document
              .createAccessor()
              .setBuffer(buffer)
              .setArray(new Float32Array(uvs))
              .setType("VEC2");

            primitive.setAttribute("TEXCOORD_0", uvAccessor);
          } else {
            const material = document.createMaterial();
            material.setName("UNTEXTURED");
            primitive.setMaterial(material);
          }

          const indexAccessor = document
            .createAccessor()
            .setBuffer(buffer)
            .setArray(new Int16Array(indices))
            .setType("SCALAR");

          primitive
            .setAttribute("POSITION", positionAccessor)
            .setIndices(indexAccessor)
            .setMode(4);

          if (textureId !== null) {
            const texturePath = cityJson.appearance?.textures![textureId];

            material.setName(texturePath!.image!);

            texturePaths.push(texturePath!.image!);
          }

          m.addPrimitive(primitive);

          if (uvs.length !== 0 && position.length / 3 !== uvs.length / 2) {
            throw new Error("!!!!");
          }
        }

        if (!globalTransformPoint) {
          if (meshes.length !== 0) throw new Error("FISHY");

          return [];
        }

        node.setTranslation([
          globalTransformPoint.x,
          globalTransformPoint.z,
          -globalTransformPoint.y,
        ]);

        let collectedTextures: { texture: Texture; name: string }[] = [];

        if (textureIdSet.size > 1) {
          for (const material of document.getRoot().listMaterials()) {
            if (material.getName() === "UNTEXTURED") continue;

            const img = await readFile(
              path.join(folderPath, material.getName()),
            );

            const texture = document
              .createTexture()
              .setImage(img)
              .setMimeType("image/png");

            material.setBaseColorTexture(texture);
          }

          await padTextures(document, 4);

          collectedTextures = await mergeTextures(
            document,
            undefined,
            undefined,
            true,
            false,
          );

          await document.transform(prune());
        }

        await document.transform(
          dedup(),
          flatten(),
          weld({}),
          join(),
          normals(),
        );

        const { cartographicBox } = getBBoxesFromMeshes(
          meshes,
          globalTransformPoint,
        );

        const serializedDoc = await io.writeBinary(document);

        result.push({
          cartographicBoxMaxX: cartographicBox.max.x,
          cartographicBoxMaxY: cartographicBox.max.y,
          cartographicBoxMaxZ: cartographicBox.max.z,
          cartographicBoxMinX: cartographicBox.min.x,
          cartographicBoxMinY: cartographicBox.min.y,
          cartographicBoxMinZ: cartographicBox.min.z,
          id,
          serializedDoc,
          isInstanced: false,
          texturePaths,
          collectedTextures: collectedTextures.map(({ texture, name }) => ({
            buffer: texture.getImage()! as Buffer,
            name,
          })),
        });

        break;
      }
    }
  }

  return result;
}
