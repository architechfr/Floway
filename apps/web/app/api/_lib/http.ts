/**
 * Garde-fous partagés par les routes API.
 * Introduits en phase 0 du plan de refonte (audit du 19/08/2026).
 */

/** Délai par défaut avant abandon d'un appel sortant, en millisecondes. */
export const DEFAULT_TIMEOUT_MS = 8000;

/** Délai allongé pour les amonts connus pour être lents (Overpass notamment). */
export const SLOW_TIMEOUT_MS = 15000;

/**
 * Retourne un `fetch` qui abandonne au bout de `ms`.
 *
 * Sans cela, un amont lent (OSRM, Overpass, TomTom) retient la fonction
 * serverless jusqu'au timeout de la plateforme. Chaque module de route fait
 * `const fetch = timeoutFetch()` au niveau module, ce qui masque le `fetch`
 * global pour tout le fichier sans avoir à modifier les points d'appel.
 *
 * Le `fetch` global de Next.js (celui qui gère `next: { revalidate }`) reste
 * bien celui appelé en interne : la sémantique de cache est préservée.
 */
export function timeoutFetch(ms: number = DEFAULT_TIMEOUT_MS): typeof globalThis.fetch {
  return (input, init) =>
    globalThis.fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(ms) });
}

/** Adresse de l'appelant, telle que fournie par le proxy de la plateforme. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded ? forwarded.split(',')[0].trim() : '';
  return first || req.headers.get('x-real-ip') || 'unknown';
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Limiteur de débit à fenêtre fixe, en mémoire.
 *
 * Limite connue : la mémoire n'est pas partagée entre instances serverless,
 * le plafond réel est donc `limit × nombre d'instances actives`. C'est un
 * garde-fou contre l'abus automatisé, pas un quota exact. À remplacer par un
 * store partagé (Vercel KV / Upstash) quand le trafic le justifiera.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  // Purge opportuniste : la map ne doit pas croître indéfiniment.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Réponse 429 normalisée. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: 'Trop de requêtes.', code: 'RATE_LIMITED' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(retryAfterSeconds),
      'cache-control': 'no-store',
    },
  });
}

/**
 * Vrai si la requête provient de l'application elle-même.
 *
 * Vérifie l'en-tête `Origin` (envoyé par les navigateurs sur les requêtes
 * `fetch` non-GET, y compris same-origin) contre l'hôte de la requête.
 * Un appel `curl` sans `Origin` est donc refusé.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get('host') || '');
  } catch {
    return false;
  }
}

/**
 * Autorise l'appel si l'appelant est l'application, ou s'il présente le secret
 * partagé `FLOWAY_API_SECRET` dans l'en-tête `x-floway-key` (usage serveur à
 * serveur, tests). Retourne `null` si l'accès est accordé, sinon la réponse
 * à renvoyer.
 */
export function requireTrustedCaller(req: Request): Response | null {
  const secret = process.env.FLOWAY_API_SECRET;
  if (secret && req.headers.get('x-floway-key') === secret) return null;
  if (isSameOrigin(req)) return null;
  return new Response(JSON.stringify({ error: 'Accès refusé.', code: 'FORBIDDEN_ORIGIN' }), {
    status: 403,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
