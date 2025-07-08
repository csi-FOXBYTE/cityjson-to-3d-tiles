import { Matrix4Tuple } from "three";

export type WorkerPayloads = WorkerInitPayload | WorkerWorkPayload;

export type WorkerInitPayload = {
  type: "init";
  data: {
    cityJsonRaw: string;
    src: string; // source srs
    dbFile: string;
    filePath: string;
  };
};

export type WorkerWorkPayload = {
  type: "work";
  data: {
    id: string;
    folderPath: string;
    appearance: string;
  };
};

export type WorkerWorkReturnType = {
  id: string;
  cartographicBoxMinX: number;
  cartographicBoxMinY: number;
  cartographicBoxMinZ: number;
  cartographicBoxMaxX: number;
  cartographicBoxMaxY: number;
  cartographicBoxMaxZ: number;
  serializedDoc?: Uint8Array;
  refId?: string;
  transformationMatrix?: Matrix4Tuple;
  isInstanced: boolean;
  texturePaths: string[];
  collectedTextures: { buffer: Buffer; name: string }[];
}[];
