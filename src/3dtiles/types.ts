export type GridItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minHeight: number;
  maxHeight: number;
  region: [number, number, number, number, number, number];
  name: string;
  isInstanced: boolean;
  attributes: Record<string, any>;
  type: string;
};

export type Tile = {
  refine: "ADD" | "REPLACE";
  geometricError: number;
  boundingVolume: {
    region: [number, number, number, number, number, number];
  };
  children?: Tile[];
  content?: {
    uri: string;
  };
};
