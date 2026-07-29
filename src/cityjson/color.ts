import rgba from "color-rgba";

export type Color = { r: number; g: number; b: number };

export type SemanticSurfaceColorInput =
  | string
  | [number, number, number]
  | Color;

export type SemanticSurfaceColorDef = Record<string, Color>;

const WHITE: Color = { r: 1, g: 1, b: 1 };

function validateChannel(value: unknown, context: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${context} must be a number between 0 and 1`);
  }

  return value;
}

export function parseColor(color: string): Color {
  const parsedColor = rgba(color);
  const red = parsedColor[0];
  const green = parsedColor[1];
  const blue = parsedColor[2];

  if (
    typeof red !== "number" ||
    typeof green !== "number" ||
    typeof blue !== "number"
  ) {
    throw new Error(`Invalid CSS color: ${color}`);
  }

  return {
    r: red / 255,
    g: green / 255,
    b: blue / 255,
  };
}

function parseSemanticSurfaceColor(
  value: unknown,
  surfaceType: string,
): Color {
  if (typeof value === "string") {
    return parseColor(value);
  }

  if (Array.isArray(value)) {
    if (value.length !== 3) {
      throw new Error(
        `Color for "${surfaceType}" must contain exactly three RGB channels`,
      );
    }

    return {
      r: validateChannel(value[0], `Red channel for "${surfaceType}"`),
      g: validateChannel(value[1], `Green channel for "${surfaceType}"`),
      b: validateChannel(value[2], `Blue channel for "${surfaceType}"`),
    };
  }

  if (typeof value === "object" && value !== null) {
    const color = value as Partial<Color>;

    return {
      r: validateChannel(color.r, `Red channel for "${surfaceType}"`),
      g: validateChannel(color.g, `Green channel for "${surfaceType}"`),
      b: validateChannel(color.b, `Blue channel for "${surfaceType}"`),
    };
  }

  throw new Error(
    `Color for "${surfaceType}" must be a CSS color, RGB array, or RGB object`,
  );
}

export function parseSemanticSurfaceColorDef(
  value: unknown,
): SemanticSurfaceColorDef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Semantic surface colors must be a JSON object");
  }

  return Object.fromEntries(
    Object.entries(value).map(([surfaceType, color]) => {
      if (surfaceType.trim().length === 0) {
        throw new Error("Semantic surface color keys must not be empty");
      }

      return [
        surfaceType,
        parseSemanticSurfaceColor(color, surfaceType),
      ];
    }),
  );
}

export function getColorFromSemanticSurface(
  surfaceType: string,
  semanticSurfaceColorDef: SemanticSurfaceColorDef,
): Color {
  return semanticSurfaceColorDef[surfaceType] ??
    semanticSurfaceColorDef["*"] ??
    WHITE;
}
