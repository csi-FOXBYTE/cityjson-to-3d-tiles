import { Box3, Vector3 } from "three";
import { cesiumCartesianToCartographicTransform } from "./cesiumCartographicToCartesion.js";

function convertBBoxToEcef(box: Box3) {
  const [cMinX, cMinY, cMinZ] = cesiumCartesianToCartographicTransform.inverse([
    (box.min.x / Math.PI) * 180,
    (box.min.y / Math.PI) * 180,
    box.min.z,
  ]);
  const [cMaxX, cMaxY, cMaxZ] = cesiumCartesianToCartographicTransform.inverse([
    (box.max.x / Math.PI) * 180,
    (box.max.y / Math.PI) * 180,
    box.max.z,
  ]);

  const newBox = new Box3(
    new Vector3(cMinX, cMinY, cMinZ),
    new Vector3(cMaxX, cMaxY, cMaxZ)
  );

  return newBox;
}

export function calculateBBoxVolume(box: Box3) {
  const convertedBox = convertBBoxToEcef(box);

  const size = convertedBox.max.clone().sub(convertedBox.min);

  const volume = Math.abs(size.x) * Math.abs(size.y) * Math.abs(size.z);

  return Math.cbrt(volume);
}
