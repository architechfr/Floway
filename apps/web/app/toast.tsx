'use client';

import styles from './toast.module.css';

/** Message bref, en bas d'ecran. Rien n'est rendu sans message. */
export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className={`${styles.toast} ${styles.visible}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
