'use client';

import { useEffect, useRef, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const updatingRef = useRef(false);

  useEffect(() => { updatingRef.current = updating; }, [updating]);

  useEffect(() => {
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    if (!standalone) {
      const dismissedAt = Number(localStorage.getItem('floway-install-dismissed') || 0);
      if (!dismissedAt || Date.now() - dismissedAt > 3 * 24 * 60 * 60 * 1000) window.setTimeout(() => setVisible(true), 1800);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    let disposed = false;
    let interval: number | null = null;
    let registration: ServiceWorkerRegistration | null = null;

    const announceUpdate = (worker: ServiceWorker) => {
      waitingWorker.current = worker;
      setUpdateReady(true);
      if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Floway', { body: 'Une nouvelle version est disponible. Ouvre Floway pour la mettre à jour.' }); } catch {}
      }
    };

    const onControllerChange = () => {
      if (updatingRef.current) window.location.reload();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
    };
    const onOnline = () => registration?.update().catch(() => undefined);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      navigator.serviceWorker.register('/sw.js').then(reg => {
        if (disposed) return;
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) announceUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) announceUpdate(worker);
          });
        });
        reg.update().catch(() => undefined);
        interval = window.setInterval(() => reg.update().catch(() => undefined), 15 * 60 * 1000);
      }).catch(() => undefined);
    }

    return () => {
      disposed = true;
      if (interval) window.clearInterval(interval);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') setVisible(false);
      setDeferredPrompt(null);
      return;
    }
    setShowIosHelp(true);
  }

  function dismiss() {
    localStorage.setItem('floway-install-dismissed', String(Date.now()));
    setVisible(false);
  }

  function applyUpdate() {
    const worker = waitingWorker.current;
    if (!worker) return;
    setUpdating(true);
    updatingRef.current = true;
    try {
      localStorage.setItem('floway:update-started-at', String(Date.now()));
    } catch {}
    worker.postMessage({ type: 'FLOWAY_SKIP_WAITING' });
    window.setTimeout(() => window.location.reload(), 6000);
  }

  return (
    <>
      {updateReady && (
        <aside className="flowayUpdate" role="dialog" aria-label="Mettre Floway à jour">
          <img src="/floway-app-icon.svg" alt="" />
          <div><small>NOUVELLE VERSION FLOWAY</small><strong>Une mise à jour est disponible</strong><span>Ton trajet et tes réglages seront conservés.</span></div>
          <button className="flowayUpdatePrimary" disabled={updating} onClick={applyUpdate}>{updating ? 'MISE À JOUR…' : 'METTRE À JOUR'}</button>
          <button className="flowayUpdateLater" onClick={() => setUpdateReady(false)} disabled={updating}>PLUS TARD</button>
        </aside>
      )}

      {!installed && visible && !updateReady && (
        <aside className="installFloway" role="dialog" aria-label="Installer Floway">
          <img src="/floway-app-icon.svg" alt="" />
          <div><small>APPLICATION FLOWAY</small><strong>Installe Floway sur ton téléphone</strong><span>Accès plein écran, icône d’accueil et lancement comme une vraie app.</span></div>
          <button className="installPrimary" onClick={install}>INSTALLER</button>
          <button className="installClose" onClick={dismiss} aria-label="Plus tard">×</button>
        </aside>
      )}

      {showIosHelp && (
        <div className="installHelpBackdrop" onClick={() => setShowIosHelp(false)}>
          <section className="installHelp" onClick={event => event.stopPropagation()}>
            <img src="/floway-app-icon.svg" alt="Logo Floway" />
            <small>INSTALLER FLOWAY</small>
            <h2>{isIos ? 'Sur iPhone / iPad' : 'Sur ton navigateur'}</h2>
            {isIos ? <div className="installSteps"><p><b>1.</b> Ouvre Floway dans <strong>Safari</strong>.</p><p><b>2.</b> Appuie sur le bouton <strong>Partager</strong> ⎙.</p><p><b>3.</b> Choisis <strong>Sur l’écran d’accueil</strong>.</p><p><b>4.</b> Appuie sur <strong>Ajouter</strong>.</p></div> : <div className="installSteps"><p>Utilise le menu de ton navigateur puis choisis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</p></div>}
            <button className="installDone" onClick={() => setShowIosHelp(false)}>J’AI COMPRIS</button>
          </section>
        </div>
      )}
    </>
  );
}
