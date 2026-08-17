'use client';

import { useEffect, useState } from 'react';

type Panel = 'menu' | 'alerts' | 'community' | 'profile' | null;

export default function InteractionLayer() {
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState('');
  const [locating, setLocating] = useState(false);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const menuButton = target.closest<HTMLButtonElement>('button.iconButton[aria-label="Menu"], button.v3icon');
      if (menuButton) {
        event.preventDefault();
        setPanel('menu');
        return;
      }

      const alertsButton = target.closest<HTMLButtonElement>('button.iconButton[aria-label="Alertes"], .v3status > button');
      if (alertsButton) {
        event.preventDefault();
        setPanel('alerts');
        return;
      }

      const gpsButton = target.closest<HTMLButtonElement>('button.gpsButton, button.v3gpsButton, [data-floway-gps]');
      if (gpsButton) {
        event.preventDefault();
        if (!navigator.geolocation) {
          notify('La géolocalisation n’est pas disponible sur cet appareil.');
          return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            setLocating(false);
            notify(`Position détectée · précision ${Math.round(coords.accuracy)} m`);
            document.querySelector('.v3miniRoute, .routeMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
          () => {
            setLocating(false);
            notify('Autorise la localisation pour utiliser Floway en mouvement.');
          },
          { enableHighAccuracy: true, timeout: 9000, maximumAge: 30_000 },
        );
        return;
      }

      const favorite = target.closest<HTMLButtonElement>('.v3stopImage > button');
      if (favorite) {
        event.preventDefault();
        favorite.classList.toggle('isFavorite');
        const active = favorite.classList.contains('isFavorite');
        favorite.textContent = active ? '♥' : '♡';
        notify(active ? 'Arrêt ajouté aux favoris.' : 'Arrêt retiré des favoris.');
        return;
      }

      const chooseButton = target.closest<HTMLButtonElement>('.v3choose, .detailSheet button.greenButton');
      if (chooseButton) {
        event.preventDefault();
        const detail = chooseButton.closest('.v3detail, .detailSheet');
        const stationName = detail?.querySelector('h2')?.textContent?.trim() || 'Cet arrêt';
        notify(`${stationName} est maintenant votre arrêt Floway.`);
        window.setTimeout(() => {
          const close = detail?.querySelector<HTMLButtonElement>('.v3close, .closeButton');
          close?.click();
        }, 350);
        return;
      }

      const routeNav = target.closest<HTMLButtonElement>('.v3nav button:first-child, .bottomNav button:first-child');
      if (routeNav) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const stationNav = target.closest<HTMLButtonElement>('.v3nav button:nth-child(2)');
      if (stationNav) {
        event.preventDefault();
        document.getElementById('v3stations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const communityNav = target.closest<HTMLButtonElement>('.v3nav button:nth-child(4)');
      if (communityNav) {
        event.preventDefault();
        setPanel('community');
        return;
      }

      const profileNav = target.closest<HTMLButtonElement>('.v3nav button:nth-child(5)');
      if (profileNav) {
        event.preventDefault();
        setPanel('profile');
        return;
      }
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <>
      {panel && (
        <div className="flowayActionBackdrop" onClick={() => setPanel(null)}>
          <section className="flowayActionSheet" onClick={event => event.stopPropagation()}>
            <div className="flowayActionHead">
              <div>
                <small>{panel === 'menu' ? 'FLOWAY' : panel === 'alerts' ? 'SIGNAL ROUTIER' : panel === 'community' ? 'COMMUNAUTÉ' : 'PROFIL'}</small>
                <strong>{panel === 'menu' ? 'Navigation Floway' : panel === 'alerts' ? 'Alertes du trajet' : panel === 'community' ? 'La route vue par les voyageurs' : 'Préférences conducteur'}</strong>
              </div>
              <button onClick={() => setPanel(null)} aria-label="Fermer">×</button>
            </div>

            {panel === 'menu' && (
              <div className="flowayMenuGrid">
                <a href="/" onClick={() => setPanel(null)}><span>⌁</span><b>Route</b><small>Revenir au voyage</small></a>
                <a href="/ev" onClick={() => setPanel(null)}><span>⚡</span><b>Électrique</b><small>Recharge intelligente</small></a>
                <button onClick={() => { setPanel(null); document.getElementById('v3stations')?.scrollIntoView({ behavior: 'smooth' }); }}><span>⛽</span><b>Stations</b><small>Voir tous les arrêts</small></button>
                <button onClick={() => setPanel('community')}><span>◉</span><b>Communauté</b><small>Avis et signal terrain</small></button>
                <button onClick={() => setPanel('profile')}><span>○</span><b>Profil</b><small>Préférences conducteur</small></button>
              </div>
            )}

            {panel === 'alerts' && (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Surveillance active</span></div>
                <h3>Floway surveille ce qui peut modifier votre arrêt.</h3>
                <p>Trafic, incidents, disponibilité des stations et changements importants alimentent progressivement la recommandation.</p>
                <div className="flowayAlertRows">
                  <div><span>Trafic</span><b>Actif / couverture partielle</b></div>
                  <div><span>Stations</span><b>Prix officiels</b></div>
                  <div><span>GPS trajet</span><b>Disponible sur mobile</b></div>
                </div>
              </div>
            )}

            {panel === 'community' && (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Communauté Floway</span></div>
                <h3>Avis, photos et informations terrain.</h3>
                <p>Cette zone accueillera les retours voyageurs sur la propreté, l’affluence, la restauration, les bornes et la qualité réelle des aires.</p>
                <div className="flowayAlertRows">
                  <div><span>Avis voyageurs</span><b>Interface prête</b></div>
                  <div><span>Photos</span><b>À connecter</b></div>
                  <div><span>Signalement terrain</span><b>À connecter</b></div>
                </div>
              </div>
            )}

            {panel === 'profile' && (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Profil conducteur</span></div>
                <h3>Vos préférences guideront Floway.</h3>
                <p>Restaurant favori, type de véhicule, fréquence de pause, carburant et services recherchés seront mémorisables ici.</p>
                <div className="flowayAlertRows">
                  <div><span>Véhicule</span><b>Thermique / EV</b></div>
                  <div><span>Préférences repas</span><b>À personnaliser</b></div>
                  <div><span>Services favoris</span><b>À personnaliser</b></div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {locating && <div className="flowayToast visible" role="status">⌖ Localisation en cours…</div>}
      {!locating && toast && <div className="flowayToast visible" role="status" aria-live="polite">{toast}</div>}
    </>
  );
}
