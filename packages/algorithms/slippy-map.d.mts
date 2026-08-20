/** Déclarations de types pour la projection Web Mercator et le pavage. */

export const TILE_SIZE: number;

/** Vue courante : niveau de zoom et centre exprimé en pixels monde. */
export type MapView = { zoom: number; centerX: number; centerY: number };

export type MapTile = { x: number; y: number; z: number; left: number; top: number };

export function worldSize(zoom: number): number;
export function project(lon: number, lat: number, zoom: number): { x: number; y: number };
export function unproject(x: number, y: number, zoom: number): { lon: number; lat: number };

export function fitView(
  coords: [number, number][] | null | undefined,
  width: number,
  height: number,
  options?: { padding?: number; minZoom?: number; maxZoom?: number },
): MapView | null;

export function tilesFor(view: MapView | null, width: number, height: number): MapTile[];

export function toScreen(
  lon: number,
  lat: number,
  view: MapView | null,
  width: number,
  height: number,
): { x: number; y: number } | null;

export function simplifyForDisplay(
  coords: [number, number][],
  maxPoints?: number,
): [number, number][];

export function panView(view: MapView, dx: number, dy: number): MapView;

export function zoomView(
  view: MapView,
  delta: number,
  options?: { minZoom?: number; maxZoom?: number },
): MapView;
