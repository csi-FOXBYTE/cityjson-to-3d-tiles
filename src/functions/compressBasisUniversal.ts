import { Document, Node } from "@gltf-transform/core";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import childProcess from "child_process";
import { readFile, rm } from "fs/promises";
import sharp from "sharp";
import { temporaryWrite } from "tempy";

/**
 * Compresses base color textures in the glTF document using Basis Universal compression.
 *
 * This function traverses all scenes and nodes in the document, and for each node containing a mesh,
 * it processes each primitive's material by compressing its base color texture. The texture image is:
 *  - Converted to PNG format using Sharp.
 *  - Written to a temporary file.
 *  - Compressed to KTX2 format via the Basis Universal command-line tool.
 *  - Replaced in the material with the new compressed texture (with MIME type "image/ktx2").
 * Additionally, the function activates the KHR_texture_basisu extension on the document.
 *
 * @param document - The glTF document containing the textures to be compressed.
 * @returns A promise that resolves when all textures have been processed.
 */
export async function compressBasisUniversal(document: Document) {
  const root = document.getRoot();

  document.createExtension(KHRTextureBasisu).setRequired(true);

  const nodes: Node[] = [];

  for (const scene of root.listScenes()) {
    scene.traverse((node) => nodes.push(node));
  }

  for (const node of nodes) {
    const mesh = node.getMesh();

    if (!mesh) continue;

    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();

      if (!material) continue;

      const texture = material.getBaseColorTexture();

      if (!texture) continue;

      const image = texture.getImage();

      if (!image) continue;

      const convertedImage = await sharp(image, { limitInputPixels: false })
        .toFormat("png")
        .toArray();

      const file = await temporaryWrite(convertedImage[0], {
        extension: "png",
      });

      const platform = process.platform;
      const arch = process.arch;

      let basisu: string;

      switch (platform) {
        case "linux":
          if (arch === "arm64") {
            basisu = import.meta
              .resolve("@gpu-tex-enc/basis/bin/linux-arm64/basisu")
              .replace("file://", "");
            break;
          }
          if (arch === "x64") {
            basisu = import.meta
              .resolve("@gpu-tex-enc/basis/bin/linux-x64/basisu")
              .replace("file://", "");
            break;
          }
          throw new Error(
            `No matching basisu bin found for ${platform} ${arch}.`
          );
        case "win32":
          if (arch === "x64") {
            basisu = import.meta
              .resolve("@gpu-tex-enc/basis/bin/win32-x64/basisu.exe")
              .replace("file:///", "");
            break;
          }
          throw new Error(
            `No matching basisu bin found for ${platform} ${arch}.`
          );
        case "darwin":
          if (arch === "arm64") {
            basisu = import.meta
              .resolve("@gpu-tex-enc/basis/bin/darwin-arm64/basisu")
              .replace("file://", "");
            break;
          }
          if (arch === "x64") {
            basisu = import.meta
              .resolve("@gpu-tex-enc/basis/bin/darwin-x64/basisu")
              .replace("file://", "");
            break;
          }
          throw new Error(
            `No matching basisu bin found for ${platform} ${arch}.`
          );
        default:
          throw new Error(
            `No matching basisu bin found for ${platform} ${arch}.`
          );
      }

      try {
        const output = `${file}.ktx2`;

        const result = childProcess.spawnSync(
          basisu,
          [
            "-file",
            file,
            "-output_file",
            output,
            "-uastc",
            "-uastc_level",
            "1",
            "-uastc_rdo_l",
            "1",
            "-ktx2",
            "-no_multithreading"
          ],
          { stdio: ["ignore", "ignore", "inherit"] }
        );

        if (result.status !== 0) throw new Error("Unexpected error in basisu!");

        const f = await readFile(output);

        const tex = document.createTexture(texture.getName());

        texture.dispose();

        tex.setImage(f);
        tex.setMimeType("image/ktx2");

        material.setBaseColorTexture(tex);

        await rm(output);
      } catch (e) {
        console.error(JSON.stringify(e));
        throw e;
      }

      await rm(file);
    }
  }
}
