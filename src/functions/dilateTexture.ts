import { Document, Texture } from "@gltf-transform/core";
import sharp from "sharp";
import { Canvas } from "skia-canvas";

function dilateInX(
  inputBuffer: Uint8Array,
  outputBuffer: Uint8Array,
  width: number,
  height: number
) {
  for (let y = 0; y < height; y++) {
    const idy = y * width * 4;

    for (let x = 0; x < width; x++) {
      const x1 = idy + x * 4;

      if (inputBuffer[x1 + 3] !== 0) {
        outputBuffer[x1] = inputBuffer[x1];
        outputBuffer[x1 + 1] = inputBuffer[x1 + 1];
        outputBuffer[x1 + 2] = inputBuffer[x1 + 2];
        outputBuffer[x1 + 3] = inputBuffer[x1 + 3];
        continue;
      }

      const x0 = idy + Math.max(0, x - 1) * 4;
      const x2 = idy + Math.min(width - 1, x + 1) * 4;

      let usedColors = 0;
      let colors = [0, 0, 0, 0];

      if (inputBuffer[x0 + 3] !== 0) {
        usedColors++;
        colors[0] += inputBuffer[x0];
        colors[1] += inputBuffer[x0 + 1];
        colors[2] += inputBuffer[x0 + 2];
        colors[3] += inputBuffer[x0 + 3];
      }

      if (inputBuffer[x2 + 3] !== 0) {
        usedColors++;
        colors[0] += inputBuffer[x2];
        colors[1] += inputBuffer[x2 + 1];
        colors[2] += inputBuffer[x2 + 2];
        colors[3] += inputBuffer[x2 + 3];
      }

      if (usedColors === 0) {
        continue;
      }

      outputBuffer[x1] = colors[0] / usedColors;
      outputBuffer[x1 + 1] = colors[1] / usedColors;
      outputBuffer[x1 + 2] = colors[2] / usedColors;
      outputBuffer[x1 + 3] = colors[3] / usedColors;
    }
  }
}

function dilateInY(
  inputBuffer: Uint8Array,
  outputBuffer: Uint8Array,
  width: number,
  height: number
) {
  for (let x = 0; x < width; x++) {
    const idx = x * 4;

    for (let y = 0; y < height; y++) {
      const x1 = y * width * 4 + idx;

      if (inputBuffer[x1 + 3] !== 0) {
        outputBuffer[x1] = inputBuffer[x1];
        outputBuffer[x1 + 1] = inputBuffer[x1 + 1];
        outputBuffer[x1 + 2] = inputBuffer[x1 + 2];
        outputBuffer[x1 + 3] = inputBuffer[x1 + 3];
        continue;
      }

      const x0 = idx + Math.max(0, y - 1) * width * 4;
      const x2 = idx + Math.min(height - 1, y + 1) * width * 4;

      let usedColors = 0;
      let colors = [0, 0, 0, 0];

      if (inputBuffer[x0 + 3] !== 0) {
        usedColors++;
        colors[0] += inputBuffer[x0];
        colors[1] += inputBuffer[x0 + 1];
        colors[2] += inputBuffer[x0 + 2];
        colors[3] += inputBuffer[x0 + 3];
      }

      if (inputBuffer[x2 + 3] !== 0) {
        usedColors++;
        colors[0] += inputBuffer[x2];
        colors[1] += inputBuffer[x2 + 1];
        colors[2] += inputBuffer[x2 + 2];
        colors[3] += inputBuffer[x2 + 3];
      }

      if (usedColors === 0) {
        continue;
      }

      outputBuffer[x1] = colors[0] / usedColors;
      outputBuffer[x1 + 1] = colors[1] / usedColors;
      outputBuffer[x1 + 2] = colors[2] / usedColors;
      outputBuffer[x1 + 3] = colors[3] / usedColors;
    }
  }
}

function createInTriangleMap(
  width: number,
  height: number,
  outBuffer: Uint8ClampedArray,
  uvs: ArrayLike<number>,
  indices?: ArrayLike<number>,
  padding = 0
) {
  const canvas = new Canvas(width, height);

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.strokeStyle = "white";
  ctx.lineWidth = padding;

  if (indices) {
    for (let i = 0; i < indices.length;) {
      const index0 = indices[i++];
      ctx.beginPath();
      ctx.moveTo(uvs[index0] * width, uvs[index0 + 1] * height);

      const index1 = indices[i++];
      ctx.lineTo(uvs[index1] * width, uvs[index1 + 1] * height);

      const index2 = indices[i++];
      ctx.lineTo(uvs[index2] * width, uvs[index2 + 1] * height);

      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < uvs.length;) {
      ctx.beginPath();
      ctx.moveTo(uvs[i++] * width, uvs[i++] * height);
      ctx.lineTo(uvs[i++] * width, uvs[i++] * height);
      ctx.lineTo(uvs[i++] * width, uvs[i++] * height);

      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  const img = ctx.getImageData(0, 0, width, height).data;

  for (let i = 0; i < img.length; i++) {
    outBuffer[i] = Math.max(img[i], outBuffer[i]);
  }
}

function clearUvs(img: Uint8Array, isInTriangleMap: Uint8ClampedArray) {
  for (let i = 0; i < isInTriangleMap.length; i += 4) {
    if (isInTriangleMap[i + 3] !== 0) continue;

    img[i] = 0;
    img[i + 1] = 0;
    img[i + 2] = 0;
    img[i + 3] = 0;
  }
}

/**
 * Clips textures to uv space and dilates around the edges
 * @param document
 */
export async function dilateTextures(document: Document) {
  const root = document.getRoot();

  const isIntriangleMaps = new Map<Texture, Uint8ClampedArray>();

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();

      if (!material) continue;

      const texture = material.getBaseColorTexture();

      if (!texture) continue;

      const image = texture.getImage();

      if (!image) continue;

      const indices = primitive.getIndices()?.getArray() ?? undefined;

      const uvs = primitive.getAttribute("TEXCOORD_0")?.getArray();

      if (!uvs) continue;

      const sharpImage = sharp(image, { limitInputPixels: false });

      const { width, height } = await sharpImage.metadata();

      if (!width || !height) continue;

      if (!isIntriangleMaps.has(texture))
        isIntriangleMaps.set(
          texture,
          new Uint8ClampedArray(width * height * 4)
        );

      createInTriangleMap(
        width,
        height,
        isIntriangleMaps.get(texture)!,
        uvs,
        indices,
        4
      );
    }
  }

  for (const [texture, isInTriangleMap] of isIntriangleMaps.entries()) {
    const image = texture.getImage()!;

    const sharpImage = sharp(image, { limitInputPixels: false });

    const { width, height } = await sharpImage.metadata();

    if (!width || !height) continue;

    const rawImage = (await sharpImage.raw().toArray())[0] as Uint8Array;

    clearUvs(rawImage, isInTriangleMap);

    const pingPongImage = new Uint8Array(rawImage);

    for (let i = 16; i < 0; i++) {
      dilateInX(rawImage, pingPongImage, width, height);
      dilateInY(pingPongImage, rawImage, width, height);
    }

    texture.setImage(
      await sharp(rawImage, {
        raw: {
          width,
          height,
          channels: 4,
        },
        limitInputPixels: false,
      })
        .toFormat("png")
        .toBuffer()
    );

    texture.setMimeType("image/png");
  }
}
