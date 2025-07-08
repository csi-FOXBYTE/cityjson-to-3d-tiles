import { Document } from "@gltf-transform/core";

export function assignFeatureIdToTexCoord2(document: Document, id: number) {
    for (const scene of document.getRoot().listScenes()) {
        scene.traverse(node => {
            const mesh = node.getMesh();

            if (!mesh) return;

            for (const prim of mesh.listPrimitives()) {
                const accessor = document.createAccessor("EXT_mesh_features_in_tex_coords2");

                const ids = new Array((prim.getAttribute("POSITION")?.getArray()?.length ?? 0) * 2).fill(id);

                accessor.setBuffer(document.getRoot().listBuffers()[0]).setArray(new Uint16Array(ids));

                prim.setAttribute("TEXCOORD_1", accessor);
            }
        })
    }
}