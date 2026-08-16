export type FuelType = 'SP95' | 'SP95_E10' | 'SP98' | 'E85' | 'GAZOLE' | 'GPLC';

export interface Station {
  id: string;
  name: string;
  brand?: string;
  latitude: number;
  longitude: number;
  motorway?: string;
  direction?: string;
}

export interface WaitObservation {
  stationId: string;
  observedAt: string;
  waitMinutes: number;
  confidence: number;
  source: 'crowd' | 'inferred' | 'operator';
}

export interface WaitEstimate {
  stationId: string;
  estimatedWaitMinutes: number;
  confidence: number;
  sampleCount: number;
}

export interface StationCandidate {
  stationId: string;
  extraDriveMinutes: number;
  waitMinutes: number;
  fuelCostDeltaEuros?: number;
}
