import { Node, NodeIO, Document } from "@gltf-transform/core";
import { Vector3 } from "three";
import { getIO } from "./io.js";

export async function checkForDegenerates(document: Document) {
  const root = document.getRoot();

  const io = await getIO();

  for (const scene of root.listScenes()) {
    const nodes: Node[] = [];

    scene.traverse((node) => nodes.push(node));

    for (const node of nodes) {
      const mesh = node.getMesh();

      if (!mesh) return;

      for (const primitive of mesh.listPrimitives()) {
        const positionAttribute = primitive
          .getAttribute("POSITION")
          ?.getArray();
        const indices = primitive.getIndices()?.getArray();

        if (!positionAttribute || !indices) continue;

        for (let i = 0; i < indices.length; ) {
          const indexA = indices[i++] * 3;
          const vertexA = new Vector3(
            positionAttribute[indexA],
            positionAttribute[indexA + 1],
            positionAttribute[indexA + 2]
          );

          const indexB = indices[i++] * 3;
          const vertexB = new Vector3(
            positionAttribute[indexB],
            positionAttribute[indexB + 1],
            positionAttribute[indexB + 2]
          );

          const indexC = indices[i++] * 3;
          const vertexC = new Vector3(
            positionAttribute[indexC],
            positionAttribute[indexC + 1],
            positionAttribute[indexC + 2]
          );

          const lengthAB = vertexA.clone().sub(vertexB).length();
          const lengthAC = vertexA.clone().sub(vertexC).length();
          const lengthBC = vertexB.clone().sub(vertexC).length();

          if (lengthAB > 500 || lengthBC > 500 || lengthAC > 500) {
            console.error({ lengthAB, lengthAC, lengthBC });
            console.log({ vertexA, vertexB, vertexC, positionAttribute });

            node.setName("DEGENERATE!!!");

            const scene = document.getRoot().getDefaultScene();

            for (const n of nodes.filter((n) => n !== node)) {
              scene?.removeChild(n);
            }

            await io.write("degenerate.glb", document);
            throw new Error("DEGENERATE DETECTED!");
          }
        }
      }
    }
  }
}
