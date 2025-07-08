import { Document } from "@gltf-transform/core";
import sharp from "sharp";
import { Database } from "sqlite";

export async function getTextures(document: Document, dbInstance: Database) {
  for (const material of document.getRoot().listMaterials()) {
    const materialName = material.getName();
    if (
      !materialName.endsWith(".jpg") &&
      !materialName.endsWith(".png") &&
      !materialName.endsWith(".jpeg")
    )
      continue;

    const row = await dbInstance.get(
      `SELECT img FROM textures WHERE path = ?`,
      [materialName]
    );

    

    if (!row) throw new Error(`No texture with name "${materialName}" found!`);

    const img = await sharp(row.img, { limitInputPixels: false })
      .toFormat("png")
      .toBuffer();

    const texture = document
      .createTexture()
      .setImage(img)
      .setMimeType("image/png");

    material.setBaseColorTexture(texture);
    material.setAlphaMode("BLEND");
  }
}
