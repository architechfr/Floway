'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const dismissedAt = Number(localStorage.getItem('floway-install-dismissed') || 0);
    if (!dismissedAt || Date.now() - dismissedAt > 3 * 24 * 60 * 60 * 1000) {
      window.setTimeout(() => setVisible(true), 1800);
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
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !visible) return null;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') setVisible(false);
      setDeferredPrompt(null);
      return;
    }
    if (isIos) {
      setShowIosHelp(true);
      return;
    }
    setShowIosHelp(true);
  }

  function dismiss() {
    localStorage.setItem('floway-install-dismissed', String(Date.now()));
    setVisible(false);
  }

  return (
    <>
      <aside className="installFloway" role="dialog" aria-label="Installer Floway">
        <img src="/floway-app-icon.svg" alt="" />
        <div>
          <small>APPLICATION FLOWAY</small>
          <strong>Installe Floway sur ton téléphone</strong>
          <span>Accès plein écran, icône d’accueil et lancement comme une vraie app.</span>
        </div>
        <button className="installPrimary" onClick={install}>INSTALLER</button>
        <button className="installClose" onClick={dismiss} aria-label="Plus tard">×</button>
      </aside>

      {showIosHelp && (
        <div className="installHelpBackdrop" onClick={() => setShowIosHelp(false)}>
          <section className="installHelp" onClick={event => event.stopPropagation()}>
            <img src="/floway-app-icon.svg" alt="Logo Floway" />
            <small>INSTALLER FLOWAY</small>
            <h2>{isIos ? 'Sur iPhone / iPad' : 'Sur ton navigateur'}</h2>
            {isIos ? (
              <div className="installSteps">
                <p><b>1.</b> Ouvre Floway dans <strong>Safari</strong>.</p>
                <p><b>2.</b> Appuie sur le bouton <strong>Partager</strong> ⎙.</p>
                <p><b>3.</b> Choisis <strong>Sur l’écran d’accueil</strong>.</p>
                <p><b>4.</b> Appuie sur <strong>Ajouter</strong>.</p>
              </div>
            ) : (
              <div className="installSteps">
                <p>Utilise le menu de ton navigateur puis choisis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</p>
              </div>
            )}
            <button className="installDone" onClick={() => setShowIosHelp(false)}>J’AI COMPRIS</button>
          </section>
        </div>
      )}
    </>
  );
}
