import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch, clientIp, rateLimit, tooManyRequests, requireTrustedCaller } from '../_lib/http';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai, sans modifier les points d'appel.
const fetch = timeoutFetch();

type AiRequest = {
  trip?: {
    origin?: string;
    destination?: string;
    departureAt?: string;
    durationMin?: number;
    distanceKm?: number;
  };
  user?: {
    fuel?: string;
    startAfterKm?: number;
    intent?: string;
    preferences?: string[];
  };
  station?: {
    name?: string;
    city?: string;
    distanceKm?: number;
    arrivalAt?: string;
    waitMin?: number;
    detourMin?: number;
    price?: number;
    services?: string[];
  };
  pois?: Array<{
    name?: string;
    category?: string;
    status?: string;
    statusLabel?: string;
    distanceM?: number;
    brand?: string;
    cuisine?: string;
  }>;
};

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

/** Taille maximale acceptee pour le corps de la requete, en octets. */
const MAX_BODY_BYTES = 8 * 1024;

/** Fenetre et plafond de la limitation de debit par IP. */
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;

export async function POST(request: NextRequest) {
  // Cette route relaie des appels factures sur la cle Mistral du projet.
  // Elle n'est ouverte qu'a l'application elle-meme (ou au porteur du secret
  // partage FLOWAY_API_SECRET), avec un plafond de taille et de debit.
  const forbidden = requireTrustedCaller(request);
  if (forbidden) return forbidden;

  const quota = rateLimit(`ai:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!quota.ok) return tooManyRequests(quota.retryAfterSeconds);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
  }

  const apiKey = process.env.mistralfloway || process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'MISTRAL_KEY_MISSING' }, { status: 503 });
  }

  let payload: AiRequest;
  try {
    // Le corps est lu en texte pour verifier sa taille reelle : l'en-tete
    // content-length peut mentir ou etre absent (transfert chunked).
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const system = `Tu es Floway AI, l'intelligence d'un assistant de voyage automobile français.
Tu ne dois jamais inventer de données factuelles absentes du contexte fourni.
Les prix, horaires, distances, temps d'attente, trafic et services viennent de sources externes ou d'estimations Floway.
Ton rôle est d'interpréter ces données pour recommander le meilleur arrêt selon l'heure de passage, le besoin probable, le détour, l'attente, les services et les préférences du conducteur.
Réponds en français, de façon concise, utile et explicable.
Retourne uniquement un objet JSON valide avec cette structure exacte :
{
  "headline": "phrase courte",
  "recommendation": "conseil principal en 1 ou 2 phrases",
  "reasoning": ["raison 1", "raison 2", "raison 3"],
  "warning": "limite ou incertitude éventuelle, sinon chaîne vide",
  "confidence": 0,
  "suggestedIntent": "carburant|cafe|repas|pause|services|autre"
}
confidence doit être un entier entre 0 et 100.`;

  const user = `Analyse ce contexte Floway et produis une recommandation explicable sans inventer d'information :\n${safeJson(payload)}`;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: 'MISTRAL_REQUEST_FAILED', detail: detail.slice(0, 500) }, { status: 502 });
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: unknown;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'EMPTY_MISTRAL_RESPONSE' }, { status: 502 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { headline: 'Analyse Floway', recommendation: content, reasoning: [], warning: '', confidence: 50, suggestedIntent: 'autre' };
    }

    return NextResponse.json({
      ...((parsed && typeof parsed === 'object') ? parsed : {}),
      provider: 'Mistral AI',
      model: data.model || 'mistral-small-latest',
    });
  } catch {
    return NextResponse.json({ error: 'MISTRAL_UNAVAILABLE' }, { status: 502 });
  }
}
