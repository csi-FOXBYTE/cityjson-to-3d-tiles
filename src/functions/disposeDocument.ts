import { Document } from "@gltf-transform/core";

export function disposeDocument(document: Document) {
  try {
    const root = document.getRoot();
    for (const acc of root.listAccessors()) {
      acc.dispose();
    }
    for (const ani of root.listAnimations()) {
      ani.dispose();
    }
    for (const buf of root.listBuffers()) {
      buf.dispose();
    }
    for (const cam of root.listCameras()) {
      cam.dispose();
    }
    for (const ext of root.listExtensions()) {
      ext.dispose();
    }
    for (const mat of root.listMaterials()) {
      mat.dispose();
    }
    for (const mes of root.listMeshes()) {
      mes.dispose();
    }
    for (const nod of root.listNodes()) {
      nod.dispose();
    }
    for (const sce of root.listScenes()) {
      sce.dispose();
    }
    for (const ski of root.listSkins()) {
      ski.dispose();
    }
    for (const tex of root.listTextures()) {
      tex.dispose();
    }
  } catch (e) {
    console.error(e);
  }
}
