# Floway — Product brief

## Problem
On busy motorway corridors, drivers often choose the nearest station without knowing whether a nearby alternative would save significant queue time.

## Core job-to-be-done
When I need fuel during a trip, tell me which upcoming station minimizes my overall stop cost: driving time, queue time and price.

## MVP success criteria
- Display nearby/upcoming stations.
- Display current fuel prices when available.
- Let a driver record queue start/end with two taps.
- Compute a live wait estimate with a confidence score.
- Recommend a better upcoming station when estimated time saved is meaningful.

## First north-star metric
Minutes of estimated waiting time saved per completed recommended stop.

## Guardrails
- Never encourage a driver to interact with the phone while moving.
- Do not store a continuous raw location history by default.
- Clearly distinguish measured, inferred and predicted wait times.
