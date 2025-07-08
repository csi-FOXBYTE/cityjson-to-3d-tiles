import { Document, Primitive } from "@gltf-transform/core";
import sharp from "sharp";

/**
 * Pads the base color textures of all materials in a glTF document with a specified padding.
 *
 * This function extends the dimensions of each texture by adding a border of pixels around it.
 * The border is created by clamping the edge pixels (i.e., replicating the edge values) from the original image.
 * Additionally, it adjusts the UV coordinates of all associated primitives so that the textures map correctly
 * onto the padded images.
 *
 * @param document - The glTF document containing the materials and textures to process.
 * @param [padding=8] - The number of pixels to pad on each side of the texture. Must be greater than 0.
 * @returns A promise that resolves when all textures have been padded and UV coordinates updated.
 *
 * @throws {Error} Throws an error if the provided padding value is less than or equal to 0.
 */
export async function padTextures(document: Document, padding = 8) {
  if (padding <= 0) throw new Error("Padding must be larger than 0!");

  for (const material of document.getRoot().listMaterials()) {
    const primitives = material.listParents().filter(parent => parent instanceof Primitive);

    if (!material) continue;

    const texture = material.getBaseColorTexture();

    if (!texture) continue;

    const img = texture.getImage();

    if (!img) continue;

    const sharpImage = sharp(img);

    const { width, height, channels, format } = await sharpImage.metadata();

    if (!width || !height || !channels || !format) continue;

    const buffer = await sharpImage.raw().toBuffer();

    const newWidth = width + 2 * padding;
    const newHeight = height + 2 * padding;

    const paddedImgBuffer = new Uint8Array(newWidth * newHeight * channels);

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.min(width - 1, Math.max(0, x - padding));
        const srcY = Math.min(height - 1, Math.max(0, y - padding));

        const srcIndex = (srcY * width + srcX) * channels;
        const destIndex = (y * newWidth + x) * channels;

        for (let c = 0; c < channels; c++) {
          paddedImgBuffer[destIndex + c] = buffer[srcIndex + c];
        }
      }
    }

    for (const prim of primitives) {
      const uvAccessor = prim.getAttribute("TEXCOORD_0");

      if (!uvAccessor) continue;

      const uvArray = uvAccessor.getArray();

      if (!uvArray) continue;

      for (let i = 0; i < uvArray.length; i += 2) {
        const x = uvArray[i] * width + padding;
        const y = uvArray[i + 1] * height + padding;

        uvArray[i] = x / newWidth;
        uvArray[i + 1] = y / newHeight;
      }

      uvAccessor.setArray(uvArray);
    }

    texture.setImage(
      await sharp(paddedImgBuffer, {
        raw: {
          width: newWidth,
          height: newHeight,
          channels,
        },
      })
        .toFormat(format)
        .toBuffer()
    );
  }

}
