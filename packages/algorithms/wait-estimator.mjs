/**
 * Robust recency-weighted wait estimator.
 * New observations count more heavily while low-confidence samples contribute less.
 */
export function estimateWait(observations, now = Date.now()) {
  const usable = observations
    .filter((o) => Number.isFinite(o.waitMinutes) && o.waitMinutes >= 0)
    .filter((o) => Number.isFinite(o.confidence) && o.confidence > 0)
    .map((o) => ({
      ...o,
      ageMinutes: Math.max(0, (now - new Date(o.observedAt).getTime()) / 60000),
    }))
    .filter((o) => o.ageMinutes <= 90);

  if (!usable.length) {
    return { estimatedWaitMinutes: null, confidence: 0, sampleCount: 0 };
  }

  const values = usable.map((o) => o.waitMinutes).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const trimmed = usable.filter((o) => Math.abs(o.waitMinutes - median) <= Math.max(8, median * 1.5));

  let weightedTotal = 0;
  let weightTotal = 0;
  for (const o of trimmed) {
    const recencyWeight = Math.exp(-o.ageMinutes / 30);
    const weight = recencyWeight * Math.min(1, o.confidence);
    weightedTotal += o.waitMinutes * weight;
    weightTotal += weight;
  }

  const estimate = weightTotal ? weightedTotal / weightTotal : median;
  const sampleFactor = Math.min(1, trimmed.length / 8);
  const avgConfidence = trimmed.reduce((sum, o) => sum + o.confidence, 0) / trimmed.length;
  const confidence = Math.min(0.98, sampleFactor * 0.65 + avgConfidence * 0.35);

  return {
    estimatedWaitMinutes: Math.round(estimate * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    sampleCount: trimmed.length,
  };
}

export function scoreStation(candidate, weights = { time: 1, price: 2 }) {
  const pricePenalty = Math.max(0, candidate.fuelCostDeltaEuros ?? 0) * weights.price;
  return candidate.extraDriveMinutes * weights.time + candidate.waitMinutes * weights.time + pricePenalty;
}

export function recommendStation(candidates, weights) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreStation(a, weights) - scoreStation(b, weights))[0];
}
