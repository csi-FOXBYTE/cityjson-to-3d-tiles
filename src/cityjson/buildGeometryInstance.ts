import type { CityJSONV201 } from "./schemas/cityjson.js";
import { getBBoxesFromMeshes } from "./helpers.js";
import proj4 from "proj4";
import { Float32BufferAttribute, Matrix4, Matrix4Tuple, Vector3 } from "three";
import { NodeIO } from "@gltf-transform/core";
import Eigen from "eigen";
import { WorkerWorkReturnType } from "./workerPayload.js";
import { Database } from "sqlite";

async function computeAffineTransformation3D(
  points1: [number, number, number][],
  points2: [number, number, number][]
) {
  await Eigen.ready;

  const Matrix = Eigen.Matrix;

  const n = points1.length;
  if (n < 4 || points2.length !== n) {
    throw new Error(
      "Need at least 4 corresponding points for a 3D transformation."
    );
  }

  // Each 3D point pair gives 3 equations.
  // Build matrix A (3n x 12) and vector b (3n x 1)
  let A_data = [];
  let b_data = [];

  for (let i = 0; i < n; i++) {
    const [x, y, z] = points1[i];
    const [xp, yp, zp] = points2[i];

    // Equation for x':
    // [ x  y  z  1  0  0  0  0  0  0  0  0 ]
    A_data.push([x, y, z, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    b_data.push([xp]); // using a column vector

    // Equation for y':
    // [ 0  0  0  0  x  y  z  1  0  0  0  0 ]
    A_data.push([0, 0, 0, 0, x, y, z, 1, 0, 0, 0, 0]);
    b_data.push([yp]);

    // Equation for z':
    // [ 0  0  0  0  0  0  0  0  x  y  z  1 ]
    A_data.push([0, 0, 0, 0, 0, 0, 0, 0, x, y, z, 1]);
    b_data.push([zp]);
  }

  // Create eigenjs Matrix objects
  const A = new Matrix(A_data);
  const b = new Matrix(b_data);

  // Compute the normal equations solution: x = (AᵀA)⁻¹ Aᵀ b
  const AT = A.transpose();
  const ATA = AT.matMul(A);
  const ATA_inv = ATA.inverse();
  const ATb = AT.matMul(b);
  const params = ATA_inv.matMul(ATb);

  // Extract parameters (order: [a, b, c, d, e, f, g, h, i, j, k, l])
  const a = params.get(0, 0);
  const b_val = params.get(1, 0);
  const c = params.get(2, 0);
  const d = params.get(3, 0);
  const e = params.get(4, 0);
  const f = params.get(5, 0);
  const g = params.get(6, 0);
  const h = params.get(7, 0);
  const i_ = params.get(8, 0);
  const j = params.get(9, 0);
  const k = params.get(10, 0);
  const l = params.get(11, 0);

  Eigen.GC.flush();

  // Construct the 4x4 transformation matrix (homogeneous coordinates)
  const transformMatrix = [
    a,
    b_val,
    c,
    d,
    e,
    f,
    g,
    h,
    i_,
    j,
    k,
    l,
    0,
    0,
    0,
    1,
  ] as Matrix4Tuple;

  return transformMatrix;
}

export async function buildGeometryInstance(
  id: string,
  cityJson: CityJSONV201,
  dest: string,
  part: {
    type: "GeometryInstance";
    template: number;
    transformationMatrix: Matrix4Tuple;
    boundaries: [number];
  },
  io: NodeIO,
  dbInstance: Database
): Promise<WorkerWorkReturnType> {
  const queryResult = await dbInstance.get(
    `SELECT doc2, srcSRS, arrayIndex, id from instancedData WHERE arrayIndex = ?`,
    [part.template]
  );

  if (!queryResult)
    throw new Error(`No geometry template found for "${part.template}"!`);

  const document = await io.readBinary(queryResult.doc2);

  const srcSrsProj4 = queryResult.srcSRS;

  const transform = proj4(srcSrsProj4, dest);

  const root = document.getRoot();

  const matrix = new Matrix4(...part.transformationMatrix);

  let globalTransformPoint: Vector3 | null = null;

  const originRaw = cityJson.vertices[part.boundaries[0]];

  const origin = [
    originRaw[0] * cityJson.transform.scale[0] +
      cityJson.transform.translate[0],
    originRaw[1] * cityJson.transform.scale[1] +
      cityJson.transform.translate[1],
    originRaw[2] * cityJson.transform.scale[2] +
      cityJson.transform.translate[2],
  ];

  const meshes: {
    position: Float32Array;
  }[] = [];

  const originalPoints: [number, number, number][] = [];
  const targetPoints: [number, number, number][] = [];

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const array = primitive.getAttribute("POSITION")?.getArray();

      if (!array) continue;

      const attribute = new Float32BufferAttribute(array, 3);

      for (let i = 0; i < attribute.array.length; i += 3) {
        originalPoints.push([
          attribute.array[i],
          attribute.array[i + 1],
          attribute.array[i + 2],
        ]);
      }

      attribute.applyMatrix4(matrix);

      for (let i = 0; i < attribute.array.length; i += 3) {
        const [x, y, z] = transform.forward([
          attribute.array[i] + origin[0],
          attribute.array[i + 1] + origin[1],
          attribute.array[i + 2] + origin[2],
        ]);

        if (!globalTransformPoint) globalTransformPoint = new Vector3(x, y, z);

        attribute.array[i] = x - globalTransformPoint.x;
        attribute.array[i + 1] = z - globalTransformPoint.z;
        attribute.array[i + 2] = -(y - globalTransformPoint.y);

        targetPoints.push([x, z, -y]);
      }

      meshes.push({
        position: attribute.array as Float32Array,
      });

      primitive
        .getAttribute("POSITION")!
        .setArray(attribute.array as Float32Array);
    }
  }

  const transformationMatrix = new Matrix4(
    ...(await computeAffineTransformation3D(
      originalPoints.slice(0, Math.min(20, originalPoints.length)),
      targetPoints.slice(0, Math.min(20, targetPoints.length))
    ))
  );

  if (!globalTransformPoint) throw new Error("FISHY!");

  const { cartographicBox } = getBBoxesFromMeshes(meshes, globalTransformPoint);

  return [
    {
      cartographicBoxMaxX: cartographicBox.max.x,
      cartographicBoxMaxY: cartographicBox.max.y,
      cartographicBoxMaxZ: cartographicBox.max.z,
      cartographicBoxMinX: cartographicBox.min.x,
      cartographicBoxMinY: cartographicBox.min.y,
      cartographicBoxMinZ: cartographicBox.min.z,
      id,
      refId: queryResult.id!.toString(),
      transformationMatrix: transformationMatrix.toArray(),
      isInstanced: true,
      collectedTextures: [],
      texturePaths: [],
      serializedDoc: undefined,
    },
  ];
}
