'use client';

/**
 * Contexte du trajet : véhicule, niveaux d'énergie, passagers, repas.
 *
 * S'ouvre après la soumission de l'itinéraire, quand la distance est connue —
 * c'est l'ordre voulu : on sait où l'on va, puis on dit avec quoi et dans
 * quelles conditions on y va.
 *
 * Le panneau ne calcule rien lui-même : il assemble les entrées et les passe
 * au moteur de `packages/algorithms/energy-model.mjs`, qui reste pur et
 * ignorant de toute source de données.
 */

import { useMemo } from 'react';
import { planTrip, usesBattery, usesFuel } from './lib/energy/model';
import {
  DEFAULT_REAL_WORLD_FACTOR,
  estimateBattery,
  estimateTank,
} from './lib/vehicles/capacity-estimates';
import { ENERGY_LABELS, VEHICLE_SIZES } from './lib/vehicles/types';
import type { EnergyKind, VehicleSize } from './lib/vehicles/types';
import { buildEstimatedProfile, useFlowayStore } from './state/floway-store';
import NumberField from './number-field';
import styles from './trip-context-panel.module.css';

type Props = {
  distanceKm: number;
  /** Prix médian relevé sur le trajet, ou null si aucun prix n'est disponible. */
  fuelPricePerL: number | null;
  onClose: () => void;
};

const number = (n: number) => n.toLocaleString('fr-FR');

export default function TripContextPanel({ distanceKm, fuelPricePerL, onClose }: Props) {
  const { vehicle, setVehicle, trip, setTrip, setVehicleConfirmed } = useFlowayStore();

  const profile = vehicle ?? buildEstimatedProfile('compacte', 'gazole');
  const { energyKind, size } = profile;
  const needsFuel = usesFuel(energyKind);
  const needsBattery = usesBattery(energyKind);

  const tankRange = estimateTank(size, energyKind);
  const batteryRange = estimateBattery(size, energyKind);

  // Recalcule tout le profil quand l'énergie ou le gabarit change : les valeurs
  // saisies pour une autre configuration n'ont plus de sens.
  const rebuild = (next: Partial<{ energyKind: EnergyKind; size: VehicleSize }>) => {
    setVehicle(
      buildEstimatedProfile(next.size ?? size, next.energyKind ?? energyKind, profile.name),
    );
  };

  const setMeasured = (
    field: 'tank' | 'battery' | 'fuelConsumption' | 'electricConsumption',
    raw: string,
  ) => {
    // Champ vide : on retire la valeur au lieu de la refuser en silence. La
    // refuser laissait le caractere efface revenir a l'ecran, le champ etant
    // controle par le modele.
    if (raw.trim() === '') {
      setVehicle({ ...profile, [field]: null });
      return;
    }
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    setVehicle({ ...profile, [field]: { value, provenance: 'saisie' } });
  };

  const plan = useMemo(
    () =>
      planTrip({
        energyKind,
        distanceKm,
        fuel: needsFuel
          ? {
              capacityL: profile.tank?.value,
              consumptionL100: profile.fuelConsumption?.value,
              levelPct: trip.fuelLevelPct,
              pricePerL: fuelPricePerL ?? undefined,
            }
          : undefined,
        battery: needsBattery
          ? {
              capacityKwh: profile.battery?.value,
              consumptionKwh100: profile.electricConsumption?.value,
              levelPct: trip.batteryLevelPct,
            }
          : undefined,
        reservePct: trip.reservePct,
        realWorldFactor: DEFAULT_REAL_WORLD_FACTOR,
      }),
    [energyKind, distanceKm, needsFuel, needsBattery, profile, trip, fuelPricePerL],
  );

  const main = needsFuel ? plan.fuel : plan.battery;
  const unit = needsFuel ? 'L' : 'kWh';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <section className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <small>VOTRE TRAJET</small>
            <h2>{number(Math.round(distanceKm))} km — avec quoi partez-vous ?</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <fieldset className={styles.group}>
          <legend>Énergie</legend>
          <div className={styles.chips}>
            {ENERGY_LABELS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`${styles.chip} ${e.id === energyKind ? styles.chipOn : ''}`}
                onClick={() => rebuild({ energyKind: e.id })}
              >
                {e.label}
                <small>{e.short}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Gabarit</legend>
          <div className={styles.chips}>
            {VEHICLE_SIZES.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`${styles.chip} ${v.id === size ? styles.chipOn : ''}`}
                onClick={() => rebuild({ size: v.id })}
              >
                {v.label}
                <small>{v.hint}</small>
              </button>
            ))}
          </div>
          <p className={styles.note}>
            Le gabarit ne sert qu&apos;à proposer un ordre de grandeur. Seules les valeurs
            ci-dessous entrent dans le calcul.
          </p>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Capacités et consommation</legend>
          <div className={styles.grid}>
            {needsFuel && (
              <>
                <Field
                  label="Réservoir"
                  unit="L"
                  measured={profile.tank}
                  range={tankRange}
                  onChange={(v) => setMeasured('tank', v)}
                />
                <Field
                  label="Consommation"
                  unit="L/100 km"
                  measured={profile.fuelConsumption}
                  onChange={(v) => setMeasured('fuelConsumption', v)}
                />
              </>
            )}
            {needsBattery && (
              <>
                <Field
                  label="Batterie utile"
                  unit="kWh"
                  measured={profile.battery}
                  range={batteryRange}
                  onChange={(v) => setMeasured('battery', v)}
                />
                <Field
                  label="Consommation"
                  unit="kWh/100 km"
                  measured={profile.electricConsumption}
                  onChange={(v) => setMeasured('electricConsumption', v)}
                />
              </>
            )}
          </div>
          <p className={styles.note}>
            Aucune base publique française ne publie la capacité de réservoir par modèle.
            Ces valeurs sont des ordres de grandeur : corrigez-les avec celles de votre carnet,
            elles seront mémorisées.
          </p>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Au départ</legend>
          <div className={styles.grid}>
            {needsFuel && (
              <Slider
                label="Carburant"
                value={trip.fuelLevelPct}
                onChange={(v) => setTrip({ fuelLevelPct: v })}
              />
            )}
            {needsBattery && (
              <Slider
                label="Batterie"
                value={trip.batteryLevelPct}
                onChange={(v) => setTrip({ batteryLevelPct: v })}
              />
            )}
            <Slider
              label="Réserve de sécurité"
              value={trip.reservePct}
              max={40}
              onChange={(v) => setTrip({ reservePct: v })}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>À bord</legend>
          <div className={styles.inline}>
            <label className={styles.inlineField}>
              Personnes
              <NumberField
                min={1}
                max={9}
                step={1}
                value={trip.passengers}
                onCommit={(v) => { if (v !== null) setTrip({ passengers: Math.round(v) }); }}
              />
            </label>
            <div className={styles.inlineField}>
              Repas prévu
              <div className={styles.chips}>
                {(['auto', 'oui', 'non'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.chip} ${styles.small} ${trip.meal === m ? styles.chipOn : ''}`}
                    onClick={() => setTrip({ meal: m })}
                  >
                    {m === 'auto' ? 'Selon l’heure' : m === 'oui' ? 'Oui' : 'Non'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </fieldset>

        <section className={styles.result}>
          <small>CE QUE ÇA DONNE</small>
          {main && main.missing.length === 0 ? (
            <>
              <div className={styles.resultGrid}>
                <Stat label="Autonomie restante" value={`${number(Math.round(main.usableRemainingRangeKm ?? 0))} km`} hint="réserve déduite" />
                <Stat
                  label={needsFuel ? 'Ravitaillements' : 'Recharges'}
                  value={String(plan.stops ?? 0)}
                  hint={plan.stops ? `1ᵉʳ vers ${number(Math.round(main.firstStopAtKm ?? 0))} km` : 'aucun arrêt nécessaire'}
                  strong={Boolean(plan.stops)}
                />
                <Stat label="Énergie du trajet" value={`${number(main.requiredQuantity ?? 0)} ${unit}`} hint={`sur ${number(Math.round(distanceKm))} km`} />
                <Stat
                  label="Coût du trajet"
                  value={plan.totalTripCost !== null ? `${number(plan.totalTripCost)} €` : '—'}
                  hint={
                    plan.totalTripCost === null
                      ? 'aucun prix relevé sur le trajet'
                      : plan.totalPurchaseCost
                        ? `dont ${number(plan.totalPurchaseCost)} € à acheter en route`
                        : 'déjà dans le réservoir, rien à acheter'
                  }
                />
              </div>
              {plan.electricCoveredKm > 0 && (
                <p className={styles.note}>
                  Les {number(Math.round(plan.electricCoveredKm))} premiers kilomètres sont couverts
                  en électrique, le reste au carburant.
                </p>
              )}
            </>
          ) : (
            <p className={styles.missing}>
              Calcul impossible : il manque {formatMissing(plan.missing)}. Renseignez ces valeurs
              ci-dessus — rien n&apos;est estimé à votre place dans le résultat.
            </p>
          )}
        </section>

        <button
          type="button"
          className={styles.validate}
          onClick={() => {
            setVehicle(profile);
            setVehicleConfirmed(true);
            onClose();
          }}
        >
          ENREGISTRER CE VÉHICULE
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  unit,
  measured,
  range,
  onChange,
}: {
  label: string;
  unit: string;
  measured: { value: number; provenance: string } | null;
  range?: { min: number; max: number; unit: string } | null;
  onChange: (value: string) => void;
}) {
  const estimated = measured?.provenance === 'estimee';
  return (
    <label className={styles.field}>
      <span>
        {label}
        {estimated && <b className={styles.badge}>estimé</b>}
      </span>
      <NumberField
        step={0.1}
        min={1}
        allowEmpty
        value={measured?.value ?? null}
        onCommit={(v) => onChange(v === null ? '' : String(v))}
      />
      <small>
        {unit}
        {range ? ` · habituellement ${range.min} à ${range.max} ${range.unit}` : ''}
      </small>
    </label>
  );
}

function Slider({
  label,
  value,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.field}>
      <span>
        {label} <b>{value} %</b>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`${styles.stat} ${strong ? styles.statStrong : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

/** Traduit les codes du moteur en langage lisible. */
function formatMissing(missing: string[]): string {
  const labels: Record<string, string> = {
    capacite: 'la capacité',
    consommation: 'la consommation',
    niveau: 'le niveau au départ',
    distance: 'la distance',
    energie: "l'énergie",
  };
  const readable = missing.map((m) => labels[m.split(':').pop() || ''] || m);
  return [...new Set(readable)].join(' et ');
}
