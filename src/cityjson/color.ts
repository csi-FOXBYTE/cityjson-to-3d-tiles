import rgba from "color-rgba";

export type Color = { r: number; g: number; b: number };

export function parseColor(color: string) {
    const parsedColor = rgba(color);

    return { r: parsedColor[0], g: parsedColor[1], b: parsedColor[2] }
}

export type SemanticSurfaceColorDef = Record<string, Color>;

export function getColorFromSemanticSurface(surfaceType: string, semanticSurfaceColorDef: SemanticSurfaceColorDef) {
    return semanticSurfaceColorDef[surfaceType] ?? { r: 1, g: 1, b: 1 };
};