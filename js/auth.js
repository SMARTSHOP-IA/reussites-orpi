// Connexion : Google pour l'équipe Smartshop, lien par e-mail (ou Google) pour la cliente et l'usine.
import { MODE, FIREBASE, DOMAINE_EQUIPE, COLL } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/gmail.send'];
let A = null, auth = null, db = null, F = null;

export const ROLES = {
  equipe: 'Équipe Smartshop',
  client: 'Cliente (lecture seule)',
  usine: 'Usine Laser Style',
};

async function charger() {
  if (A) return;
  const { initializeApp, getApps } = await import(`${FB}/firebase-app.js`);
  A = await import(`${FB}/firebase-auth.js`);
  F = await import(`${FB}/firebase-firestore.js`);
  const app = getApps()[0] || initializeApp(FIREBASE);
  auth = A.getAuth(app);
  db = F.getFirestore(app);
}

async function roleDe(user) {
  const email = (user.email || '').toLowerCase();
  if (email.endsWith(`@${DOMAINE_EQUIPE}`) && user.emailVerified) return 'equipe';
  // Comme les autres outils : un rôle « editor » dans authorizedUsers donne l'accès équipe.
  try {
    const u = await F.getDoc(F.doc(db, 'authorizedUsers', user.email));
    if (u.exists() && u.data().role === 'editor') return 'equipe';
  } catch { /* pas dans la liste */ }
  const s = await F.getDoc(F.doc(db, COLL.acces, email));
  return s.exists() ? s.data().role : null;
}

// Renvoie l'utilisateur connecté ({email, nom, role}) ou null.
export async function utilisateurCourant() {
  if (MODE === 'demo') {
    const r = sessionStorage.getItem('reussites:roleDemo');
    return r ? { email: 'demo@smartshop.fr', nom: 'Mode démo', role: r } : null;
  }
  await charger();
  if (A.isSignInWithEmailLink(auth, location.href)) {
    let email = localStorage.getItem('reussites:emailLien') || prompt('Confirmez votre adresse e-mail');
    await A.signInWithEmailLink(auth, email, location.href);
    history.replaceState(null, '', location.pathname);
  }
  const user = await new Promise(res => { const u = A.onAuthStateChanged(auth, x => { u(); res(x); }); });
  if (!user) return null;
  const role = await roleDe(user);
  return { email: user.email, nom: user.displayName || user.email, role, refuse: !role };
}

export async function connexionDemo(role) { sessionStorage.setItem('reussites:roleDemo', role); }

export async function connexionGoogle() {
  await charger();
  // Connexion simple (comme les autres outils) : les droits Sheets/Gmail ne sont demandés
  // qu'au moment de vérifier le fichier client ou d'envoyer un e-mail.
  const p = new A.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  await A.signInWithPopup(auth, p);
}

export async function envoyerLienConnexion(email) {
  await charger();
  await A.sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
  localStorage.setItem('reussites:emailLien', email);
}

export async function deconnexion() {
  if (MODE === 'demo') { sessionStorage.removeItem('reussites:roleDemo'); return; }
  await charger();
  sessionStorage.removeItem('reussites:jetonGoogle');
  await A.signOut(auth);
}

function memoriserJeton(t) {
  if (t) sessionStorage.setItem('reussites:jetonGoogle', JSON.stringify({ t, exp: Date.now() + 55 * 60 * 1000 }));
}

// Jeton d'accès Google (lecture du Sheet + envoi Gmail). interactif = peut ouvrir une fenêtre Google.
export async function jetonGoogle(interactif = false) {
  if (MODE === 'demo') return null;
  try {
    const j = JSON.parse(sessionStorage.getItem('reussites:jetonGoogle') || 'null');
    if (j && j.exp > Date.now()) return j.t;
  } catch { /* ignore */ }
  if (!interactif) return null;
  await charger();
  const p = new A.GoogleAuthProvider();
  SCOPES.forEach(s => p.addScope(s));
  const r = await A.reauthenticateWithPopup(auth.currentUser, p);
  const t = A.GoogleAuthProvider.credentialFromResult(r)?.accessToken;
  memoriserJeton(t);
  return t;
}
