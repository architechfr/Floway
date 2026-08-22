'use client';

import { useEffect, useState } from 'react';

import { useFlowayStore } from './state/floway-store';
import styles from './action-sheet.module.css';

export type ActionPanel = 'menu' | 'alerts' | 'community' | 'profile' | 'share' | null;

const EYEBROW: Record<Exclude<ActionPanel, null>, string> = {
  menu: 'FLOWAY', alerts: 'SIGNAL ROUTIER', community: 'COMMUNAUTÉ', share: 'PARTAGER', profile: 'PROFIL',
};
const TITLE: Record<Exclude<ActionPanel, null>, string> = {
  menu: 'Navigation Floway',
  alerts: 'Alertes du trajet',
  community: 'La route vue par les voyageurs',
  share: 'Partager Floway',
  profile: 'Préférences conducteur',
};

/**
 * Feuilles d'action de l'application : menu, alertes, communaute, profil, partage.
 *
 * Reprend le rendu de `interaction-layer`, sans ce qui l'accompagnait : un
 * ecouteur de clic en phase de capture sur `document` qui detournait les
 * boutons de la page par leurs selecteurs CSS (`.v3icon`, `.v3status > button`,
 * `.v3nav button:nth-child(4)`…), et l'ouverture simulee de la fenetre
 * d'itineraire (clic sur `.v3routeTitle`, ecriture par le setter natif,
 * `requestSubmit()`) pour rejouer un favori. Ces boutons portent desormais
 * leur propre `onClick`, et rejouer un favori appelle directement le calcul.
 */
export type AlertItem = {
  id: string;
  icon: string;
  label: string;
  description?: string;
  roads?: string[];
  distanceKm?: number | null;
  delayMin?: number | null;
  from?: string | null;
  to?: string | null;
};

export default function ActionSheet({
  panel,
  onPanel,
  onPickRoute,
  onScrollToStations,
  onNotify,
  alerts = [],
  alertsConnected = false,
  onAcknowledgeAlerts,
}: {
  panel: ActionPanel;
  onPanel: (panel: ActionPanel) => void;
  onPickRoute: (origin: string, destination: string) => void;
  onScrollToStations: () => void;
  onNotify: (message: string) => void;
  /** Incidents réels non encore acquittés, à afficher tels quels. */
  alerts?: AlertItem[];
  alertsConnected?: boolean;
  onAcknowledgeAlerts?: () => void;
}) {
  const { favoriteRoutes, removeFavoriteRoute } = useFlowayStore();
  const [shareUrl, setShareUrl] = useState('');

  // `window` n'existe pas au rendu serveur.
  useEffect(() => { setShareUrl(window.location.origin); }, []);

  // Échap ferme la feuille, comme le clic sur le fond.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, onPanel]);

  if (!panel) return null;

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onNotify('Lien Floway copié.');
    } catch {
      onNotify('Impossible de copier automatiquement le lien.');
    }
  }

  async function share() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Floway', text: 'Teste Floway, le copilote intelligent pour la route.', url: shareUrl });
        return;
      } catch {
        // Partage refusé ou annulé : on retombe sur la copie du lien.
      }
    }
    await copyLink();
  }

  return (
    <div className={styles.backdrop} onClick={() => onPanel(null)}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={TITLE[panel]}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div><small>{EYEBROW[panel]}</small><strong>{TITLE[panel]}</strong></div>
          <button type="button" className={styles.close} onClick={() => onPanel(null)} aria-label="Fermer">×</button>
        </div>

        {panel === 'menu' && (
          <>
            <div className={styles.menuGrid}>
              <a href="/" onClick={() => onPanel(null)}><span>⌁</span><b>Route</b><small>Revenir au voyage</small></a>
              <a href="/ev" onClick={() => onPanel(null)}><span>⚡</span><b>Électrique</b><small>Recharge intelligente</small></a>
              <button type="button" onClick={() => { onPanel(null); onScrollToStations(); }}><span>⛽</span><b>Stations</b><small>Voir tous les arrêts</small></button>
              <button type="button" onClick={() => onPanel('community')}><span>◉</span><b>Communauté</b><small>Avis et signal terrain</small></button>
              <button type="button" onClick={() => onPanel('profile')}><span>○</span><b>Profil</b><small>Préférences conducteur</small></button>
              <button type="button" onClick={() => onPanel('share')}><span>▦</span><b>Partager Floway</b><small>QR code · lien · partage téléphone</small></button>
            </div>
            <div className={styles.favorites}>
              <div className={styles.favoritesHead}>
                <span>☆ ITINÉRAIRES FAVORIS</span>
                <small>Stockés uniquement sur ce téléphone</small>
              </div>
              {favoriteRoutes.length === 0 ? (
                <p>Aucun favori pour le moment. Utilise ☆ à côté de l’itinéraire pour l’enregistrer sans compte.</p>
              ) : favoriteRoutes.map((route) => (
                <div className={styles.favoriteRow} key={route.id}>
                  <button type="button" onClick={() => { onPanel(null); onPickRoute(route.origin, route.destination); }}>
                    <strong>{route.origin} → {route.destination}</strong>
                    <small>Recalculer cet itinéraire</small>
                  </button>
                  <button type="button" aria-label={`Supprimer ${route.origin} → ${route.destination} des favoris`} onClick={() => removeFavoriteRoute(route.id)}>×</button>
                </div>
              ))}
            </div>
          </>
        )}

        {panel === 'share' && (
          <div className={styles.share}>
            <div className={styles.qr}>
              {shareUrl && <img src={`https://quickchart.io/qr?text=${encodeURIComponent(shareUrl)}&size=260&margin=2`} alt="QR code pour ouvrir Floway" />}
            </div>
            <h3>Ouvre Floway sur un autre téléphone</h3>
            <p>Scanne ce QR code avec l’appareil photo de l’autre téléphone, ou partage directement le lien.</p>
            <div className={styles.shareUrl}>{shareUrl}</div>
            <div className={styles.shareActions}>
              <button type="button" onClick={share}>↗ PARTAGER</button>
              <button type="button" onClick={copyLink}>⧉ COPIER LE LIEN</button>
            </div>
            <small className={styles.shareHint}>Le QR code pointe toujours vers l’adresse Floway actuellement ouverte.</small>
          </div>
        )}

        {panel === 'alerts' && (
          <div className={styles.content}>
            {/* Le panneau annonçait « surveillance active » sans jamais dire ce
                qui était surveillé : la pastille comptait des incidents que
                rien ici ne montrait, et rien ne permettait de les éteindre. */}
            <div className={styles.state}>
              <i /> <span>{alertsConnected ? 'TomTom Traffic · temps réel' : 'Source trafic non connectée'}</span>
            </div>
            {alerts.length ? (
              <>
                <h3>
                  {alerts.length} incident{alerts.length > 1 ? 's' : ''} sur votre route
                </h3>
                <p>Signalés par TomTom à moins de 35 km de votre position. Aucun radar ni danger n’est inventé.</p>
                <div className={styles.alertList}>
                  {alerts.map((a) => (
                    <article key={a.id}>
                      <b>{a.icon}</b>
                      <div>
                        <strong>
                          {a.label}
                          {a.roads?.length ? ` · ${a.roads.join(', ')}` : ''}
                        </strong>
                        <small>
                          {[
                            a.distanceKm != null ? `${a.distanceKm.toFixed(1)} km` : null,
                            a.delayMin ? `+${a.delayMin} min` : null,
                            a.from && a.to ? `${a.from} → ${a.to}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        {a.description && a.description !== a.label ? <p>{a.description}</p> : null}
                      </div>
                    </article>
                  ))}
                </div>
                {onAcknowledgeAlerts && (
                  <button type="button" className={styles.ackButton} onClick={onAcknowledgeAlerts}>
                    MARQUER COMME LU
                  </button>
                )}
              </>
            ) : (
              <>
                <h3>Aucun incident signalé sur votre route.</h3>
                <p>
                  {alertsConnected
                    ? 'TomTom ne remonte aucun incident dans la zone surveillée. Rien n’est affiché tant qu’une source réelle ne signale rien.'
                    : 'La source trafic n’est pas connectée : Floway préfère ne rien afficher plutôt qu’une alerte inventée.'}
                </p>
              </>
            )}
            <div className={styles.rows}>
              <div><span>Trafic</span><b>{alertsConnected ? 'TomTom · temps réel' : 'Non connecté'}</b></div>
              <div><span>Stations</span><b>Prix officiels</b></div>
              <div><span>Zones de danger</span><b>Source à connecter</b></div>
            </div>
          </div>
        )}

        {panel === 'community' && (
          <div className={styles.content}>
            <div className={styles.state}><i /> <span>Communauté Floway</span></div>
            <h3>Avis, photos et informations terrain.</h3>
            <p>Cette zone accueillera les retours voyageurs sur la propreté, l’affluence, la restauration, les bornes et la qualité réelle des aires.</p>
            <div className={styles.rows}>
              <div><span>Avis voyageurs</span><b>Interface prête</b></div>
              <div><span>Photos</span><b>À connecter</b></div>
              <div><span>Signalement terrain</span><b>À connecter</b></div>
            </div>
          </div>
        )}

        {panel === 'profile' && (
          <div className={styles.content}>
            <div className={styles.state}><i /> <span>Profil conducteur local</span></div>
            <h3>Pas de compte obligatoire pour l’instant.</h3>
            <p>Véhicule, priorité de pause et itinéraires favoris sont mémorisés localement sur cet appareil.</p>
            <div className={styles.rows}>
              <div><span>Véhicule</span><b>Mémorisé localement</b></div>
              <div><span>Préférence d’arrêt</span><b>Mémorisée localement</b></div>
              <div><span>Itinéraires favoris</span><b>{favoriteRoutes.length}</b></div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
