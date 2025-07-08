import { Transform } from "@gltf-transform/core";
import { Box3, Vector3 } from "three";

export function quantizePositions(): Transform {
  return (document) => {
    let boundingBox = new Box3();

    const min: [number, number, number] = [0, 0, 0];
    const max: [number, number, number] = [0, 0, 0];

    const vector = new Vector3();

    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const positionAttribute = primitive.getAttribute("POSITION");

        if (!positionAttribute) continue;

        positionAttribute.getMin(min);
        positionAttribute.getMax(max);

        vector.fromArray(min);

        boundingBox.expandByPoint(vector);

        vector.fromArray(max);

        boundingBox.expandByPoint(vector);
      }
    }

    const size = new Vector3();

    boundingBox.getSize(size);

    const remainder = 64;

    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const vertexMap = new Map<string, number[]>();

        const positionAttribute = primitive.getAttribute("POSITION");

        if (!positionAttribute) continue;

        const positions = positionAttribute.getArray();

        if (!positions) continue;

        for (let i = 0; i < positions.length; i += 3) {
          const xQuant = Math.round(
            ((positions[i] - boundingBox.min.x) / size.x) * remainder
          );
          positions[i] = (xQuant / remainder) * size.x + boundingBox.min.x;
          const yQuant = Math.round(
            ((positions[i + 1] - boundingBox.min.y) / size.y) * remainder
          );
          positions[i + 1] = (yQuant / remainder) * size.y + boundingBox.min.y;
          const zQuant = Math.round(
            ((positions[i + 2] - boundingBox.min.z) / size.z) * remainder
          );

          const key = `${xQuant}_${yQuant}_${zQuant}`;

          const array = vertexMap.get(key) ?? [];
          array.push(i / 3);
          vertexMap.set(key, array);
        }

        const verticesToRemoveSet = new Set(
          Array.from(vertexMap.values())
            .filter((value) => value.length > 1)
            .flatMap((value) => value.slice(1))
        );

        const indices = primitive.getIndices()!.getArray()!;

        const newIndices = new Array<number>();

        for (let i = 0; i < indices.length; i += 3) {
          const i0 = indices[i + 0];
          const i1 = indices[i + 1];
          const i2 = indices[i + 2];

          if (
            verticesToRemoveSet.has(i0) &&
            verticesToRemoveSet.has(i1) &&
            verticesToRemoveSet.has(i2)
          ) {
            continue;
          }

          newIndices.push(i0, i1, i2);
        }

        primitive.getIndices()!.setArray(new Uint16Array(newIndices));
      }
    }
  };
}
