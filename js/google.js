// Appels aux API Google avec le jeton de l'utilisateur connecté (aucun serveur intermédiaire).

import { API_URL } from './config.js';
import { jetonFirebase } from './auth.js';

// Appel au service d'envoi (compte délégué) avec le jeton Firebase de l'utilisateur.
export async function appelerService(chemin, donnees) {
  const r = await fetch(`${API_URL.replace(/\/$/, '')}${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await jetonFirebase()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(donnees || {}),
  });
  let j = {};
  try { j = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) throw new Error(j.erreur || `Service d'envoi : erreur ${r.status}`);
  return j;
}

export async function etatService() {
  const r = await fetch(`${API_URL.replace(/\/$/, '')}/`);
  return r.json();
}

export function idDepuisUrl(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9-_]{20,})/);
  return m ? m[1] : String(url || '').trim();
}

async function appel(url, jeton, options = {}) {
  const r = await fetch(url, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error?.message || msg; } catch { /* ignore */ }
    if (r.status === 403 || r.status === 404) msg += " — vérifiez que votre compte Google a bien accès au fichier de la cliente.";
    throw new Error(msg);
  }
  return r.json();
}

// Renvoie le contenu de l'onglet sous forme de tableau de lignes.
export async function lireSheet(url, onglet, jeton) {
  const id = idDepuisUrl(url);
  let plage = onglet;
  if (!plage) {
    const meta = await appel(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, jeton);
    plage = meta.sheets[0].properties.title;
  }
  const r = await appel(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(plage)}?valueRenderOption=UNFORMATTED_VALUE`, jeton);
  return r.values || [];
}

function b64utf8(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

// Envoie un e-mail depuis la boîte Gmail de l'utilisateur connecté.
export async function envoyerMail({ a, cc, objet, corps }, jeton) {
  const mime = [
    `To: ${a}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: =?UTF-8?B?${b64utf8(objet)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64utf8(corps).replace(/(.{76})/g, '$1\r\n'),
  ].filter(x => x !== null).join('\r\n');
  const raw = b64utf8(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return appel('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', jeton, { method: 'POST', body: JSON.stringify({ raw }) });
}
