import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateWait, recommendStation } from './wait-estimator.mjs';

test('recent observations dominate stale observations', () => {
  const now = new Date('2026-08-16T20:00:00Z').getTime();
  const result = estimateWait([
    { observedAt: '2026-08-16T19:58:00Z', waitMinutes: 5, confidence: 1 },
    { observedAt: '2026-08-16T19:55:00Z', waitMinutes: 7, confidence: 0.9 },
    { observedAt: '2026-08-16T19:10:00Z', waitMinutes: 25, confidence: 1 },
  ], now);
  assert.ok(result.estimatedWaitMinutes < 12);
  assert.equal(result.sampleCount, 2);
});

test('recommendation minimizes overall generalized cost', () => {
  const best = recommendStation([
    { stationId: 'A', extraDriveMinutes: 0, waitMinutes: 20, fuelCostDeltaEuros: 0 },
    { stationId: 'B', extraDriveMinutes: 6, waitMinutes: 3, fuelCostDeltaEuros: 1 },
  ]);
  assert.equal(best.stationId, 'B');
});
