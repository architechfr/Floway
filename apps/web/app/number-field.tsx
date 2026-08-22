'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Champ numerique dont le bornage s'applique a la validation, pas a la frappe.
 *
 * Les champs de l'application bornaient a chaque touche :
 *
 *     onChange={e => setTrip({ passengers: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })}
 *
 * Effacer le contenu produit une chaine vide, `Number('')` vaut 0, `|| 1` la
 * ramene a 1 : le champ se reremplit tout seul et devient impossible a vider.
 * La variante de `trip-context-panel` refusait carrement la mise a jour
 * (`if (value <= 0) return`), ce qui, sur un champ controle, faisait revenir
 * le caractere efface. Celle de `/ev` laissait un 0 collant devant.
 *
 * Ici le champ garde son texte pendant la saisie et ne remonte une valeur que
 * lorsqu'elle est exploitable. Le bornage et la normalisation se font a la
 * sortie du champ.
 */
export default function NumberField({
  value,
  onCommit,
  min,
  max,
  step,
  allowEmpty = false,
  selectOnFocus = true,
  className,
  ...rest
}: {
  /** Valeur retenue, ou null si le champ est vide. */
  value: number | null;
  /** Appele quand une valeur exploitable est saisie, ou null si le champ est vide. */
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Autorise le champ a rester vide apres la validation. */
  allowEmpty?: boolean;
  /** Selectionne le contenu a la prise de focus, pour remplacer d'un coup. */
  selectOnFocus?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step' | 'type'>) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const focused = useRef(false);

  // Tant que l'utilisateur ne saisit pas, le champ suit la valeur du modele :
  // une correction venue d'ailleurs (curseur, estimation) s'y reflete.
  useEffect(() => {
    if (!focused.current) setDraft(value === null ? '' : String(value));
  }, [value]);

  const parse = (raw: string) => {
    const n = Number(raw.replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  };
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max);
  const clamp = (n: number) => Math.min(max ?? n, Math.max(min ?? n, n));

  return (
    <input
      {...rest}
      className={className}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        if (selectOnFocus) e.currentTarget.select();
        rest.onFocus?.(e);
      }}
      onMouseUp={(e) => {
        // Sans cela, le navigateur replace le curseur au relachement du clic
        // et annule la selection faite au focus. L'ancien layer
        // `numeric-input-fix` contournait le probleme par un setTimeout, au
        // prix d'une course avec la frappe : empecher le comportement par
        // defaut est synchrone, donc sans course.
        if (selectOnFocus && e.currentTarget.selectionStart === null) e.preventDefault();
        rest.onMouseUp?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Une saisie intermediaire — vide, « 1. », « - » — ne remonte rien :
        // on la laisse a l'ecran sans toucher au modele.
        if (raw.trim() === '') {
          if (allowEmpty) onCommit(null);
          return;
        }
        const n = parse(raw);
        if (n !== null && inRange(n)) onCommit(n);
      }}
      onBlur={(e) => {
        focused.current = false;
        const n = parse(draft);
        if (draft.trim() === '' || n === null) {
          // Champ laisse vide : on garde le vide si c'est permis, sinon on
          // rend la derniere valeur retenue plutot qu'un zero invente.
          if (allowEmpty) { onCommit(null); setDraft(''); }
          else setDraft(value === null ? '' : String(value));
        } else {
          const borne = clamp(n);
          onCommit(borne);
          setDraft(String(borne));
        }
        rest.onBlur?.(e);
      }}
    />
  );
}
