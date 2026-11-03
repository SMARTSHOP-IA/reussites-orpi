// Réussites Orpi — service d'envoi d'e-mails et de lecture du Google Sheet au nom d'un compte Workspace
// (celia@smartshop.fr). Aucune dépendance : Node 18+.
//
// Variables d'environnement (Railway) :
//   GOOGLE_SA_KEY      contenu JSON de la clé du compte de service (délégation au niveau du domaine activée)
//   COMPTE_DELEGUE     adresse au nom de laquelle agir (défaut : celia@smartshop.fr)
//   FIREBASE_PROJECT   projet Firebase des utilisateurs (défaut : smartshop-catalogues)
//   ORIGINES           origines autorisées, séparées par des virgules (défaut : https://smartshop-ia.github.io)
//   DOMAINE_EQUIPE     domaine des comptes équipe (défaut : smartshop.fr)
//   PORT               fourni par Railway
import http from 'node:http';
import crypto from 'node:crypto';

const CLE = JSON.parse(process.env.GOOGLE_SA_KEY || '{}');
const DELEGUE = process.env.COMPTE_DELEGUE || 'celia@smartshop.fr';
const PROJET = process.env.FIREBASE_PROJECT || 'smartshop-catalogues';
const ORIGINES = (process.env.ORIGINES || 'https://smartshop-ia.github.io').split(',').map(s => s.trim());
const DOMAINE = process.env.DOMAINE_EQUIPE || 'smartshop.fr';
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/spreadsheets.readonly'];

const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------- Jeton Google au nom du compte délégué ----------
let cache = { jeton: null, exp: 0 };
async function jetonDelegue() {
  if (cache.jeton && cache.exp > Date.now() + 60_000) return cache.jeton;
  if (!CLE.private_key) throw erreur(500, 'GOOGLE_SA_KEY manquante sur le service');
  const t = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corps = b64url(JSON.stringify({ iss: CLE.client_email, sub: DELEGUE, scope: SCOPES.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${entete}.${corps}`).sign(CLE.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${entete}.${corps}.${sig}` }),
  });
  const j = await r.json();
  if (!r.ok) throw erreur(502, `Délégation Google refusée (${j.error}: ${j.error_description || ''}). Vérifiez la délégation au niveau du domaine pour ce compte de service.`);
  cache = { jeton: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cache.jeton;
}

// ---------- Vérification du jeton Firebase de l'utilisateur ----------
let certs = { cles: null, exp: 0 };
async function certificats() {
  if (certs.cles && certs.exp > Date.now()) return certs.cles;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const age = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  certs = { cles: await r.json(), exp: Date.now() + age * 1000 };
  return certs.cles;
}

async function verifierUtilisateur(req) {
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [h, p, s] = jwt.split('.');
  if (!s) throw erreur(401, 'Connexion requise');
  const entete = JSON.parse(Buffer.from(h, 'base64url'));
  const charge = JSON.parse(Buffer.from(p, 'base64url'));
  const cert = (await certificats())[entete.kid];
  const ok = cert && crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(cert, Buffer.from(s, 'base64url'));
  const t = Date.now() / 1000;
  if (!ok || charge.aud !== PROJET || charge.iss !== `https://securetoken.google.com/${PROJET}` || charge.exp < t) throw erreur(401, 'Session invalide, reconnectez-vous');
  const email = String(charge.email || '').toLowerCase();
  if (email.endsWith(`@${DOMAINE}`) && charge.email_verified) return email;
  // Rôle « editor » dans authorizedUsers (comme les autres outils Smartshop)
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents/authorizedUsers/${encodeURIComponent(charge.email)}`, { headers: { Authorization: `Bearer ${jwt}` } });
  if (r.ok && (await r.json()).fields?.role?.stringValue === 'editor') return email;
  throw erreur(403, 'Action réservée à l\'équipe Smartshop');
}

// ---------- Actions ----------
async function lireSheet({ url, onglet }) {
  const id = (String(url || '').match(/\/d\/([a-zA-Z0-9-_]{20,})/) || [])[1] || String(url || '').trim();
  if (!id) throw erreur(400, 'Lien du Google Sheet manquant');
  const t = await jetonDelegue();
  const g = async u => {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (!r.ok) throw erreur(r.status, `Google Sheets : ${j.error?.message || r.status}${r.status === 403 || r.status === 404 ? ` — le compte ${DELEGUE} doit avoir accès au fichier.` : ''}`);
    return j;
  };
  let plage = onglet;
  if (!plage) plage = (await g(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`)).sheets[0].properties.title;
  const v = await g(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(plage)}?valueRenderOption=UNFORMATTED_VALUE`);
  return { values: v.values || [] };
}

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
async function envoyerMail({ a, cc, objet, corps, nomExpediteur }, auteur) {
  if (!a || !objet || !corps) throw erreur(400, 'Destinataire, objet et texte obligatoires');
  const propre = s => String(s).replace(/[\r\n]+/g, ' ').trim();
  const mime = [
    `From: ${nomExpediteur ? `=?UTF-8?B?${b64(propre(nomExpediteur))}?= ` : ''}<${DELEGUE}>`,
    `To: ${propre(a)}`,
    cc ? `Cc: ${propre(cc)}` : null,
    `Subject: =?UTF-8?B?${b64(propre(objet))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    `X-Envoye-Par: ${propre(auteur)}`,
    '',
    b64(corps).replace(/(.{76})/g, '$1\r\n'),
  ].filter(x => x !== null).join('\r\n');
  const t = await jetonDelegue();
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }),
  });
  const j = await r.json();
  if (!r.ok) throw erreur(r.status, `Gmail : ${j.error?.message || r.status}`);
  return { id: j.id, expediteur: DELEGUE };
}

// ---------- Serveur ----------
function erreur(code, message) { const e = new Error(message); e.code = code; return e; }

const serveur = http.createServer(async (req, res) => {
  const origine = req.headers.origin;
  if (origine && (ORIGINES.includes(origine) || /^http:\/\/localhost(:\d+)?$/.test(origine))) {
    res.setHeader('Access-Control-Allow-Origin', origine);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  const repondre = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && req.url === '/') return repondre(200, { service: 'reussites-orpi-api', compte: DELEGUE, pret: !!CLE.private_key });
    if (req.method !== 'POST') throw erreur(404, 'Introuvable');
    let corps = '';
    for await (const c of req) { corps += c; if (corps.length > 2_000_000) throw erreur(413, 'Requête trop grande'); }
    const donnees = corps ? JSON.parse(corps) : {};
    const utilisateur = await verifierUtilisateur(req);
    if (req.url === '/sheet') return repondre(200, await lireSheet(donnees));
    if (req.url === '/mail') {
      const r = await envoyerMail(donnees, utilisateur);
      console.log(new Date().toISOString(), 'mail', utilisateur, '->', donnees.a);
      return repondre(200, r);
    }
    throw erreur(404, 'Introuvable');
  } catch (e) {
    if (!e.code || e.code >= 500) console.error(e);
    repondre(e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { erreur: e.message });
  }
});

serveur.listen(process.env.PORT || 8787, () => console.log(`reussites-orpi-api prêt (compte ${DELEGUE})`));
