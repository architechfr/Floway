'use client';

import { useEffect } from 'react';

function normalizeVehicleNumber(input: HTMLInputElement) {
  if (!input.closest('.vehicleModal')) return;
  if (input.type !== 'number') return;
  const raw = input.value;
  if (/^0\d+/.test(raw)) {
    const normalized = String(Number(raw));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, normalized);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export default function NumericInputFix() {
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const input = event.target as HTMLInputElement | null;
      if (!input?.matches('.vehicleModal input[type="number"]')) return;
      window.setTimeout(() => input.select(), 0);
    };
    const onInput = (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      if (input) normalizeVehicleNumber(input);
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('input', onInput, true);
    };
  }, []);
  return null;
}
