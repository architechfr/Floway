/**
 * Accès typé à l'horloge du trajet.
 *
 * Un instant absolu circule entre le client et l'API ; l'affichage se fait
 * toujours dans le fuseau du trajet. Voir le module source pour le détail du
 * problème que cela corrige.
 */

export {
  TRIP_TIME_ZONE,
  formatTimeInZone,
  instantFromLocalInput,
  minutesOfDayInZone,
  zonedDateKey,
  zonedParts,
} from '../../../../../packages/algorithms/trip-clock.mjs';
