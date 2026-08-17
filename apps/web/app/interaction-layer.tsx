'use client';

import { useEffect, useState } from 'react';

type Panel = 'menu' | 'alerts' | null;

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

      const menuButton = target.closest<HTMLButtonElement>('button.iconButton[aria-label="Menu"]');
      if (menuButton) {
        event.preventDefault();
        setPanel('menu');
        return;
      }

      const alertsButton = target.closest<HTMLButtonElement>('button.iconButton[aria-label="Alertes"]');
      if (alertsButton) {
        event.preventDefault();
        setPanel('alerts');
        return;
      }

      const gpsButton = target.closest<HTMLButtonElement>('button.gpsButton');
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
            notify(`Position détectée · ${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`);
            document.querySelector('.routeMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
          () => {
            setLocating(false);
            notify('Autorise la localisation pour positionner ton trajet.');
          },
          { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 },
        );
        return;
      }

      const chooseButton = target.closest<HTMLButtonElement>('.detailSheet button.greenButton');
      if (chooseButton) {
        event.preventDefault();
        const sheet = chooseButton.closest('.detailSheet');
        const stationName = sheet?.querySelector('.detailHero h2')?.textContent?.trim() || 'cet arrêt';
        notify(`${stationName} ajouté comme arrêt Floway.`);
        window.setTimeout(() => {
          const close = sheet?.querySelector<HTMLButtonElement>('.closeButton');
          close?.click();
        }, 350);
        return;
      }

      const routeNav = target.closest<HTMLButtonElement>('.bottomNav button:first-child');
      if (routeNav) {
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
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
                <small>{panel === 'menu' ? 'FLOWAY' : 'SIGNAL ROUTIER'}</small>
                <strong>{panel === 'menu' ? 'Où veux-tu aller ?' : 'Alertes du trajet'}</strong>
              </div>
              <button onClick={() => setPanel(null)} aria-label="Fermer">×</button>
            </div>

            {panel === 'menu' ? (
              <div className="flowayMenuGrid">
                <a href="/" onClick={() => setPanel(null)}><span>⛽</span><b>Thermique</b><small>Stations, prix, attente</small></a>
                <a href="/ev" onClick={() => setPanel(null)}><span>⚡</span><b>Électrique</b><small>Recharge intelligente</small></a>
                <button onClick={() => { setPanel(null); document.getElementById('stations')?.scrollIntoView({ behavior: 'smooth' }); }}><span>⌁</span><b>Stations</b><small>Voir les arrêts</small></button>
                <button onClick={() => { setPanel(null); document.querySelectorAll<HTMLButtonElement>('.bottomNav button')[2]?.click(); }}><span>◉</span><b>Communauté</b><small>Signal terrain</small></button>
                <button onClick={() => { setPanel(null); document.querySelectorAll<HTMLButtonElement>('.bottomNav button')[3]?.click(); }}><span>○</span><b>Profil</b><small>Préférences conducteur</small></button>
              </div>
            ) : (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Surveillance active</span></div>
                <h3>Floway surveille les événements utiles au trajet.</h3>
                <p>Trafic public, incidents et changements importants peuvent alimenter les recommandations quand les données sont disponibles.</p>
                <div className="flowayAlertRows">
                  <div><span>Trafic</span><b>Connecté / couverture partielle</b></div>
                  <div><span>Stations</span><b>Prix officiels</b></div>
                  <div><span>Alertes personnalisées</span><b>En préparation</b></div>
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
