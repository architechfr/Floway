'use client';

import { useEffect, useState } from 'react';

type Panel = 'menu' | 'alerts' | 'community' | 'profile' | 'share' | null;
type SavedRoute = { id: string; origin: string; destination: string; savedAt: number };

const ROUTES_KEY = 'floway:favorite-routes';

function readSavedRoutes(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(ROUTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function currentRoute() {
  const routeButton = document.querySelector<HTMLButtonElement>('.v3routeTitle');
  const text = routeButton?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const parts = text.split('→').map(value => value.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { origin: parts[0], destination: parts[1] };
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function InteractionLayer() {
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState('');
  const [locating, setLocating] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [shareUrl, setShareUrl] = useState('');

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  function persistRoutes(next: SavedRoute[]) {
    setSavedRoutes(next);
    try { localStorage.setItem(ROUTES_KEY, JSON.stringify(next)); } catch {}
  }

  function openRouteEditor(origin: string, destination: string) {
    const routeButton = document.querySelector<HTMLButtonElement>('.v3routeTitle');
    routeButton?.click();
    window.setTimeout(() => {
      const form = document.querySelector<HTMLFormElement>('.v3modal');
      const inputs = form?.querySelectorAll<HTMLInputElement>('input');
      if (!form || !inputs || inputs.length < 2) {
        notify('Impossible d’ouvrir l’éditeur d’itinéraire.');
        return;
      }
      setNativeInputValue(inputs[0], origin);
      setNativeInputValue(inputs[1], destination);
      window.setTimeout(() => form.requestSubmit(), 20);
    }, 80);
  }

  function toggleCurrentRouteFavorite() {
    const route = currentRoute();
    if (!route) {
      notify('Aucun itinéraire actif à enregistrer.');
      return;
    }
    const key = `${route.origin.toLowerCase()}::${route.destination.toLowerCase()}`;
    const existing = savedRoutes.find(item => `${item.origin.toLowerCase()}::${item.destination.toLowerCase()}` === key);
    if (existing) {
      persistRoutes(savedRoutes.filter(item => item.id !== existing.id));
      notify('Itinéraire retiré des favoris.');
    } else {
      persistRoutes([{ id: `${Date.now()}`, ...route, savedAt: Date.now() }, ...savedRoutes].slice(0, 8));
      notify('Itinéraire enregistré sur ce téléphone.');
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify('Lien Floway copié.');
    } catch {
      notify('Impossible de copier automatiquement le lien.');
    }
  }

  async function shareApp() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Floway', text: 'Teste Floway, le copilote intelligent pour la route.', url: shareUrl });
        return;
      } catch {}
    }
    await copyShareLink();
  }

  useEffect(() => {
    setSavedRoutes(readSavedRoutes());
    setShareUrl(window.location.origin);

    const mountRouteActions = () => {
      const routeButton = document.querySelector<HTMLButtonElement>('.v3routeTitle');
      if (!routeButton || document.querySelector('.flowayRouteActions')) return;
      const actions = document.createElement('div');
      actions.className = 'flowayRouteActions';
      actions.innerHTML = '<button type="button" data-floway-route-reverse aria-label="Inverser le trajet">⇄ <span>Inverser</span></button><button type="button" data-floway-route-favorite aria-label="Ajouter cet itinéraire aux favoris">☆ <span>Favori</span></button>';
      routeButton.insertAdjacentElement('afterend', actions);
    };

    mountRouteActions();
    const observer = new MutationObserver(mountRouteActions);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const reverseRoute = target.closest<HTMLButtonElement>('[data-floway-route-reverse]');
      if (reverseRoute) {
        event.preventDefault();
        event.stopPropagation();
        const route = currentRoute();
        if (!route) return notify('Itinéraire introuvable.');
        openRouteEditor(route.destination, route.origin);
        notify(`${route.destination} → ${route.origin} en cours de calcul…`);
        return;
      }

      const favoriteRoute = target.closest<HTMLButtonElement>('[data-floway-route-favorite]');
      if (favoriteRoute) {
        event.preventDefault();
        event.stopPropagation();
        toggleCurrentRouteFavorite();
        return;
      }

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
  }, [savedRoutes]);

  const panelEyebrow = panel === 'menu' ? 'FLOWAY' : panel === 'alerts' ? 'SIGNAL ROUTIER' : panel === 'community' ? 'COMMUNAUTÉ' : panel === 'share' ? 'PARTAGER' : 'PROFIL';
  const panelTitle = panel === 'menu' ? 'Navigation Floway' : panel === 'alerts' ? 'Alertes du trajet' : panel === 'community' ? 'La route vue par les voyageurs' : panel === 'share' ? 'Partager Floway' : 'Préférences conducteur';

  return (
    <>
      {panel && (
        <div className="flowayActionBackdrop" onClick={() => setPanel(null)}>
          <section className="flowayActionSheet" onClick={event => event.stopPropagation()}>
            <div className="flowayActionHead">
              <div><small>{panelEyebrow}</small><strong>{panelTitle}</strong></div>
              <button onClick={() => setPanel(null)} aria-label="Fermer">×</button>
            </div>

            {panel === 'menu' && (
              <>
                <div className="flowayMenuGrid">
                  <a href="/" onClick={() => setPanel(null)}><span>⌁</span><b>Route</b><small>Revenir au voyage</small></a>
                  <a href="/ev" onClick={() => setPanel(null)}><span>⚡</span><b>Électrique</b><small>Recharge intelligente</small></a>
                  <button onClick={() => { setPanel(null); document.getElementById('v3stations')?.scrollIntoView({ behavior: 'smooth' }); }}><span>⛽</span><b>Stations</b><small>Voir tous les arrêts</small></button>
                  <button onClick={() => setPanel('community')}><span>◉</span><b>Communauté</b><small>Avis et signal terrain</small></button>
                  <button onClick={() => setPanel('profile')}><span>○</span><b>Profil</b><small>Préférences conducteur</small></button>
                  <button onClick={() => setPanel('share')}><span>▦</span><b>Partager Floway</b><small>QR code · lien · partage téléphone</small></button>
                </div>
                <div className="flowayFavoriteRoutes">
                  <div className="flowayFavoriteHead"><span>☆ ITINÉRAIRES FAVORIS</span><small>Stockés uniquement sur ce téléphone</small></div>
                  {savedRoutes.length === 0 ? <p>Aucun favori pour le moment. Utilise ☆ à côté de l’itinéraire pour l’enregistrer sans compte.</p> : savedRoutes.map(route => (
                    <div className="flowayFavoriteRow" key={route.id}>
                      <button onClick={() => { setPanel(null); openRouteEditor(route.origin, route.destination); }}><strong>{route.origin} → {route.destination}</strong><small>Recalculer cet itinéraire</small></button>
                      <button aria-label="Supprimer ce favori" onClick={() => persistRoutes(savedRoutes.filter(item => item.id !== route.id))}>×</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {panel === 'share' && (
              <div className="flowaySharePanel">
                <div className="flowayQrWrap">
                  {shareUrl && <img src={`https://quickchart.io/qr?text=${encodeURIComponent(shareUrl)}&size=260&margin=2`} alt="QR code pour ouvrir Floway" />}
                </div>
                <h3>Ouvre Floway sur un autre téléphone</h3>
                <p>Scanne ce QR code avec l’appareil photo de l’autre téléphone, ou partage directement le lien.</p>
                <div className="flowayShareUrl">{shareUrl}</div>
                <div className="flowayShareActions">
                  <button onClick={shareApp}>↗ PARTAGER</button>
                  <button onClick={copyShareLink}>⧉ COPIER LE LIEN</button>
                </div>
                <small className="flowayShareHint">Le QR code pointe toujours vers l’adresse Floway actuellement ouverte.</small>
              </div>
            )}

            {panel === 'alerts' && (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Surveillance active</span></div>
                <h3>Floway surveille ce qui peut modifier votre arrêt.</h3>
                <p>Trafic, incidents, disponibilité des stations et changements importants alimentent progressivement la recommandation.</p>
                <div className="flowayAlertRows"><div><span>Trafic</span><b>Actif / couverture partielle</b></div><div><span>Stations</span><b>Prix officiels</b></div><div><span>GPS trajet</span><b>Disponible sur mobile</b></div></div>
              </div>
            )}

            {panel === 'community' && (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Communauté Floway</span></div>
                <h3>Avis, photos et informations terrain.</h3>
                <p>Cette zone accueillera les retours voyageurs sur la propreté, l’affluence, la restauration, les bornes et la qualité réelle des aires.</p>
                <div className="flowayAlertRows"><div><span>Avis voyageurs</span><b>Interface prête</b></div><div><span>Photos</span><b>À connecter</b></div><div><span>Signalement terrain</span><b>À connecter</b></div></div>
              </div>
            )}

            {panel === 'profile' && (
              <div className="flowayAlertContent">
                <div className="flowayAlertState"><i /> <span>Profil conducteur local</span></div>
                <h3>Pas de compte obligatoire pour l’instant.</h3>
                <p>Véhicule, priorité de pause et itinéraires favoris sont mémorisés localement sur cet appareil.</p>
                <div className="flowayAlertRows"><div><span>Véhicule</span><b>Mémorisé localement</b></div><div><span>Préférence d’arrêt</span><b>Mémorisée localement</b></div><div><span>Itinéraires favoris</span><b>{savedRoutes.length}</b></div></div>
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
