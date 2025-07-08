import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { EXTMeshFeatures } from "../EXTMeshFeatures/EXTMeshFeatures.js";
import { EXTStructuralMetadata } from "../EXTMeshFeatures/EXTStructuralMetadata.js";
// @ts-expect-error has no types
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { EXTInstanceFeatures } from "../EXTMeshFeatures/EXTInstanceFeatures.js";

Logger.DEFAULT_INSTANCE = new Logger(Logger.Verbosity.SILENT);

let io: NodeIO | null;

export async function getIO() {
  if (!io) {
    await MeshoptEncoder.ready;
    io = new NodeIO()
      .registerExtensions([
        ...ALL_EXTENSIONS,
        EXTMeshFeatures,
        EXTStructuralMetadata,
        EXTInstanceFeatures,
      ])
      .registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(), // Optional.
        "draco3d.encoder": await draco3d.createEncoderModule(), // Optional.
        "meshopt.decoder": MeshoptDecoder,
        "meshopt.encoder": MeshoptEncoder,
      });
  }

  return io;
}
