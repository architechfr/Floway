/** Accès typé à la projection Web Mercator et au pavage. */

export {
  TILE_SIZE,
  fitView,
  panView,
  project,
  simplifyForDisplay,
  tilesFor,
  toScreen,
  unproject,
  worldSize,
  zoomView,
  zoomViewAt,
} from '../../../../../packages/algorithms/slippy-map.mjs';

export type { MapTile, MapView } from '../../../../../packages/algorithms/slippy-map.mjs';
