import { Box2, Vector2 } from "three";

interface PointWithData<Data> {
  x: number;
  y: number;
  data: Data;
}

export class Grid2D<Data> {
  private readonly _bounds: Box2;
  private readonly _indexWidth: number;
  private readonly _indexHeight: number;
  private readonly _size: Vector2;

  private readonly _sparseCells: Map<number, PointWithData<Data>[]> = new Map();

  constructor(bounds: Box2, cellSize: number) {
    this._size = new Vector2();
    this._bounds = bounds;

    bounds.getSize(this._size);

    this._indexWidth = Math.ceil(this._size.x / cellSize);
    this._indexHeight = Math.ceil(this._size.y / cellSize);
  }

  add(x: number, y: number, data: Data) {
    const index = this._calculateIndex(x, y);

    if (!this._sparseCells.has(index)) this._sparseCells.set(index, []);

    this._sparseCells.get(index)!.push({ x, y, data });
  }

  traverse(fn: (points: PointWithData<Data>[], x: number, y: number) => void) {
    for (let y = 0; y < this._indexHeight; y++) {
      for (let x = 0; x < this._indexWidth; x++) {
        const index = this._calculateIndex(x, y);

        if (!this._sparseCells.has(index)) continue;

        fn(this._sparseCells.get(index)!, x, y);
      }
    }
  }

  get cells() {
    return Array.from(this._sparseCells.values());
  }

  private _calculateIndex(x: number, y: number) {
    const ix = Math.floor(
      ((x - this._bounds.min.x) / this._size.x) * this._indexWidth
    );

    const iy = Math.floor(
      ((y - this._bounds.min.y) / this._size.y) * this._indexHeight
    );

    return ix + iy * this._indexWidth;
  }
}
