import { Document, Primitive, Texture } from "@gltf-transform/core";
import sharp from "sharp";
import {
  MaxRectsPacker,
  Rectangle,
} from "maxrects-packer/dist/maxrects-packer.js";

/**
 * Merges base color textures from all materials in a glTF document into one or more texture atlases.
 *
 * This function traverses all scenes in the document to collect base color textures from each primitive's material.
 * It then groups these textures by material name and packs them into one or more atlases using the MaxRectsPacker algorithm.
 * The atlases are composited using the Sharp library and optionally resized by the provided factor.
 * After composing the atlas, the function updates the UV coordinates of each primitive to reflect their new positions
 * within the atlas and assigns a new material with the merged texture. Optionally, it collects the created textures.
 *
 * @param document - The glTF document containing scenes, meshes, primitives, and materials.
 * @param [resizeFactor=1] - Scaling factor applied to the atlas dimensions after packing. Default is 1.
 * @param [maxResolution=16384] - The maximum resolution for the texture atlas (width and height).
 * @param [collectTextures=false] - Whether to collect and return the created textures along with their names.
 * @param [pot=true] - If true, the atlas dimensions will be forced to power-of-two values.
 * @returns A promise that resolves to an array of objects, each containing a merged texture and its associated material name.
 */
export async function mergeTextures(
  document: Document,
  resizeFactor: number = 1,
  maxResolution = 16384,
  collectTextures = false,
  pot = true
) {
  const root = document.getRoot();

  const mainMaterial = document.createMaterial("base");

  const boxes: {
    width: number;
    height: number;
    imageData: Buffer;
    imageName: string;
    primitive: Primitive;
    id: string;
  }[] = [];

  for (const scene of root.listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh();

      if (!mesh) return;

      const primitives = mesh.listPrimitives();

      for (const primitive of primitives) {
        const material = primitive.getMaterial();

        if (!material) continue;

        const texture = material.getBaseColorTexture();

        if (!texture) continue;

        const mimeType = texture.getMimeType();
        const imageData = texture.getImage();
        const size = texture.getSize();

        if (!imageData || !mimeType || !size) continue;

        const buffer = Buffer.from(imageData);

        boxes.push({
          width: size[0],
          height: size[1],
          imageData: buffer,
          imageName: material.getName(),
          primitive: primitive,
          id: crypto.randomUUID(),
        });

        primitive.setMaterial(mainMaterial);
      }
    });
  }

  const boxesMap = new Map<
    string,
    {
      width: number;
      height: number;
      imageData: Buffer;
      primitives: Primitive[];
    }
  >();

  boxes.forEach((box) => {
    if (!boxesMap.has(box.imageName)) {
      boxesMap.set(box.imageName, {
        height: box.height,
        width: box.width,
        imageData: box.imageData,
        primitives: [box.primitive],
      });
    } else {
      boxesMap.get(box.imageName)!.primitives.push(box.primitive);
    }
  });

  const packer = new MaxRectsPacker(
    maxResolution / resizeFactor,
    maxResolution / resizeFactor,
    2,
    {
      allowRotation: false,
      pot,
      smart: true,
      square: false,
      border: 0,
      logic: 1,
    }
  );

  packer.addArray(Array.from(boxesMap.values()) as unknown as Rectangle[]);

  let collectedTextures: { texture: Texture; name: string }[] = [];

  for (const bin of packer.bins) {
    const composited: { top: number; left: number; input: Buffer }[] = [];

    for (const rect of bin.rects) {
      composited.push({
        input: rect.rot
          ? await sharp(rect.imageData).rotate(90).toBuffer()
          : rect.imageData,
        top: rect.y,
        left: rect.x,
      });
    }

    const compositedBase = await sharp({
      create: {
        width: bin.width,
        height: bin.height,
        background: { r: 128, g: 128, b: 128, alpha: 0 },
        channels: 4,
      },
      limitInputPixels: false,
    })
      .composite(composited)
      .toFormat("png")
      .toBuffer();

    const tempBase = sharp(compositedBase, {
      limitInputPixels: false,
    }).resize({
      width: bin.width * resizeFactor,
      height: bin.height * resizeFactor,
      background: { alpha: 1, r: 128, g: 128, b: 128 },
    });

    const base = await tempBase.toFormat("png").toBuffer();

    const materialName = crypto.randomUUID();

    const material = document.createMaterial(materialName);

    const texture = document.createTexture("base");

    texture.setMimeType("image/png");
    texture.setImage(base);

    if (collectTextures)
      collectedTextures.push({ texture, name: materialName });

    material.setBaseColorTexture(texture);
    material.setDoubleSided(true);

    for (const { primitives, x, y, width, height, rot } of bin.rects) {
      for (const primitive of primitives) {
        const uvAttr = (primitive as Primitive).getAttribute("TEXCOORD_0");

        if (!uvAttr) continue;

        const uvArray = uvAttr.getArray();

        if (!uvArray) continue;

        if (rot) {
          const scaleX = height / bin.height;
          const scaleY = width / bin.width;

          const offsetX = y / bin.height;
          const offsetY = x / bin.width;

          for (let i = 0; i < uvArray.length; i += 2) {
            const u = uvArray[i + 1] * scaleX + offsetX;
            const v = uvArray[i] * scaleY + offsetY;

            uvArray[i] = u;
            uvArray[i + 1] = v;
          }
        } else {
          const scaleX = width / bin.width;
          const scaleY = height / bin.height;

          const offsetX = x / bin.width;
          const offsetY = y / bin.height;

          for (let i = 0; i < uvArray.length; i += 2) {
            const u = uvArray[i] * scaleX + offsetX;
            const v = uvArray[i + 1] * scaleY + offsetY;

            uvArray[i] = u;
            uvArray[i + 1] = v;
          }
        }

        uvAttr.setArray(uvArray);

        primitive.setMaterial(material);
      }
    }
  }

  return collectedTextures;
}
