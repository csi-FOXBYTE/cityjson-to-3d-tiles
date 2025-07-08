import { Document, Node, Primitive } from "@gltf-transform/core";
import { Box2, Vector2, Vector3 } from "three";
import sharp from "sharp";

export async function compressUvs(document: Document) {
  const root = document.getRoot();

  const nodes: Node[] = [];

  for (const scene of root.listScenes()) {
    scene.traverse((node) => nodes.push(node));
  }

  const primitiveMap = new Map<
    string,
    {
      primitives: Primitive[];
      bbox: Box2;
    }
  >();

  for (const node of nodes) {
    const mesh = node.getMesh();

    if (!mesh) continue;

    for (const primitive of mesh.listPrimitives()) {
      const uvs = primitive.getAttribute("TEXCOORD_0");

      const array = uvs?.getArray();

      const material = primitive.getMaterial();

      if (!array || !material) continue;

      const localBBox = new Box2();

      const vec2 = new Vector2();

      for (let i = 0; i < array.length; ) {
        vec2.set(array[i++], array[i++]);
        localBBox.expandByPoint(vec2);
      }

      if (!primitiveMap.has(material.getName())) {
        primitiveMap.set(material.getName(), {
          primitives: [primitive],
          bbox: localBBox,
        });
      } else {
        const a = primitiveMap.get(material.getName())!;
        a.primitives.push(primitive);
        a.bbox.union(localBBox);
      }
    }
  }

  for (const { primitives, bbox } of primitiveMap.values()) {
    const bboxSize = new Vector2();

    bbox.getSize(bboxSize);

    let baseImage: Uint8Array | null = null;
    let extractedWidth = 0;
    let extractedHeight = 0;
    let extractedTop = 0;
    let extractedLeft = 0;

    for (const primitive of primitives) {
      const material = primitive.getMaterial();

      if (!material) continue;

      const texture = material.getBaseColorTexture();

      if (!texture) continue;

      const image = texture.getImage();

      if (!image) continue;

      const [width, height] = texture.getSize()!;

      if (!baseImage) {
        extractedWidth = Math.ceil(width * bboxSize.x);
        extractedHeight = Math.ceil(height * bboxSize.y);
        extractedLeft = Math.floor(width * bbox.min.x);
        extractedTop = Math.floor(height * bbox.min.y);

        baseImage = (
          await sharp(image, { limitInputPixels: false })
            .extract({
              width: extractedWidth,
              height: extractedHeight,
              left: extractedLeft,
              top: extractedTop,
            })
            .toFormat("png")
            .toArray()
        )[0];
      }

      const uvAttr = primitive.getAttribute("TEXCOORD_0");

      if (!uvAttr) continue;

      const uvArray = uvAttr.getArray();

      if (!uvArray) continue;

      const scale: [number, number] = [1, 1];
      const offset: [number, number] = [0, 0];

      scale[0] = width / extractedWidth;
      scale[1] = height / extractedHeight;

      offset[0] = extractedLeft / width;
      offset[1] = extractedTop / height;

      for (let i = 0; i < uvArray.length; i += 2) {
        const u = uvArray[i];
        const v = uvArray[i + 1];

        uvArray[i] = u * scale[0] + offset[0];
        uvArray[i + 1] = v * scale[1] + offset[1];
      }

      uvAttr.setArray(uvArray);

      primitive.setMaterial(material);
    }
  }
}
