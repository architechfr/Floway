# MVP backlog

## P0 — Foundation
- [x] Repository structure
- [x] Domain model
- [x] Initial Supabase schema
- [x] Wait estimator v0
- [x] Station recommendation score v0
- [x] Basic mobile home screen
- [x] CI test workflow

## P1 — First usable prototype
- [ ] Bootstrap Expo project dependencies
- [ ] Connect Supabase project
- [ ] Import French public fuel-station dataset
- [ ] Add station map/list around current location
- [ ] Add station detail screen
- [ ] Add “start queue” / “finished fueling” controls
- [ ] Persist wait observations
- [ ] Display live wait estimate + confidence

## P2 — Autoroute recommendation
- [ ] Fetch current route
- [ ] Identify stations ahead, not behind driver
- [ ] Estimate extra drive time for each stop
- [ ] Rank candidate stations
- [ ] Add recommendation card with time saved

## P3 — Passive inference
- [ ] Geofence station entries
- [ ] Detect low-speed queue patterns locally
- [ ] Convert motion into anonymous station events
- [ ] Validate inferred observations against manual samples
