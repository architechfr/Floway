/** Déclarations de types pour les alertes routières. */

export type IncidentLike = {
  category?: number | string;
  roads?: string[];
  from?: string | null;
  to?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export function cleIncident(incident: IncidentLike | null | undefined): string | null;
export function nonAcquittes<T extends IncidentLike>(incidents?: T[], acquittees?: string[]): T[];
export function acquittementsUtiles(acquittees?: string[], incidentsPresents?: IncidentLike[]): string[];
