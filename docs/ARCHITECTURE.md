# Architecture

## Mobile
Expo / React Native / TypeScript.

Responsibilities:
- Location permission and geofencing
- Station discovery UI
- Queue start/end interaction
- Recommendation presentation
- Local preprocessing of raw movement where practical

## Backend
Supabase Postgres + PostGIS.

Responsibilities:
- Station catalogue
- Fuel prices
- Aggregated station events
- Wait observations and estimates
- Realtime estimate distribution

## Data pipeline
1. Import official station and fuel-price data.
2. Normalize source station identifiers.
3. Receive manual/inferred queue observations.
4. Recompute rolling wait estimate.
5. Combine wait estimate with route cost to rank upcoming stations.

## Privacy
Prefer event-level storage over continuous coordinate storage. Raw device location should be transformed into station-level events on device whenever technically possible.
