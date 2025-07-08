import proj4 from "proj4";

const cesiumCartographic = "+proj=longlat +datum=WGS84 +no_defs +type=crs";
const cesiumCartesian =
  "+proj=geocent +datum=WGS84 +units=m +no_defs +type=crs";

export const cesiumCartesianToCartographicTransform = proj4(
  cesiumCartesian,
  cesiumCartographic
);