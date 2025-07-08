import { Transform } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";

export function removeUntextured(): Transform {
  return (document) => {
    for (const scene of document.getRoot().listScenes()) {
      scene.traverse((node) => {
        const mesh = node.getMesh();

        if (!mesh) return;

        for (const primitive of mesh.listPrimitives()) {
          const material = primitive.getMaterial();

          if (!material?.getBaseColorTexture()) {
            primitive.detach();
          }
        }
      });
    }

    prune()(document);
  };
}
