// Couche de données : Firestore en production, localStorage en mode démo. Même interface dans les deux cas.
import { MODE, FIREBASE, COLL } from './config.js';

const COLLECTIONS = ['references', 'gies', 'lignes', 'lots'];

// Paramètres par défaut d'une édition (complétés par ceux enregistrés)
export const PARAMETRES_DEFAUT = {
  ordreMetaux: ['Bronze', 'Argent', 'Or', 'Platine'],
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1OCOyLNPjlPmBOTvhcZuzaEjXC0R2RaYrAd1ij2xFtbc/edit',
  sheetOnglet: 'CATEGORIES CONFONDUES',
  expediteurNom: 'Célia – Smartshop',
  mailObjet: 'Réussites Orpi {edition} – vos informations de livraison ({gie})',
  mailCorps: "Bonjour {prenom},\n\nLes trophées Réussites {edition} de votre région ({gie}) sont en préparation : {nb} trophées au total.\n\nPouvez-vous nous indiquer la date de livraison souhaitée, l'adresse de livraison et le contact sur place via ce formulaire :\n{lien}\n\nMerci d'avance,\n{expediteur}",
  relanceObjet: 'Relance – Réussites Orpi {edition} : vos informations de livraison ({gie})',
  relanceCorps: "Bonjour {prenom},\n\nSauf erreur de notre part, nous n'avons pas encore reçu vos informations de livraison pour les trophées Réussites {edition} ({nb} trophées).\n\nVoici le lien du formulaire :\n{lien}\n\nMerci d'avance,\n{expediteur}",
};
const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
const ecouteurs = new Set();
let etat = null;
let impl = null;

export const store = {
  get etat() { return etat; },
  surChangement(fn) { ecouteurs.add(fn); return () => ecouteurs.delete(fn); },
  async init(edition, role) { impl = MODE === 'demo' ? demo : await firestore(); etat = await impl.charger(edition, role); },
  // ops : [{ type: 'set' | 'delete', coll, id, data }] — coll 'parametres' n'a pas d'id
  async ecrire(ops) { if (ops.length) await impl.ecrire(ops); },
  async journaliser(entrees) { if (entrees.length) await impl.journaliser(entrees); },
  lireFormulaire: t => (impl || demo).lireFormulaire(t),
  ecrireFormulaire: (t, d) => impl.ecrireFormulaire(t, d),
  repondreFormulaire: (t, r) => (impl || demo).repondreFormulaire(t, r),
  lireAcces: () => impl.lireAcces(),
  ecrireAcces: (email, role) => impl.ecrireAcces(email, role),
  supprimerAcces: email => impl.supprimerAcces(email),
  async listerEditions() { return impl.listerEditions(); },
  async creerEdition(ed, donnees) { return impl.creerEdition(ed, donnees); },
  reinitialiserDemo() { return demo.reinitialiser(); },
  importerJeu: (ed, jeu) => impl.importerJeu(ed, jeu),
  importerJeuDemo: (ed, jeu) => demo.importerJeu(ed, jeu),
  setImplFormulaire(x) { impl = x; },
};

function notifier() { for (const fn of ecouteurs) fn(etat); }

function appliquerLocal(ops) {
  for (const o of ops) {
    if (o.coll === 'parametres') { etat.parametres = { ...o.data }; continue; }
    if (o.type === 'delete') delete etat[o.coll][o.id];
    else etat[o.coll][o.id] = o.data;
  }
}

// ---------------------------------------------------------------- Mode démo
const cle = ed => `reussites:${ed}`;
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert(`Stockage local plein : ${e.message}`); } };

const demo = {
  edition: null,
  async charger(edition) {
    this.edition = edition;
    let data = lsGet(cle(edition));
    let rep = null;
    if (!data && edition === '2026') rep = await fetch('data/seed-2026.json').catch(() => null);
    if (!data && rep?.ok) {
      const seed = await rep.json();
      data = {
        parametres: seed.parametres,
        references: Object.fromEntries(seed.references.map(r => [r.id, r])),
        gies: seed.gies,
        lignes: Object.fromEntries(seed.lignes.map(l => [l.id, l])),
        lots: Object.fromEntries(seed.lots.map(l => [l.id, l])),
        journal: seed.journal.map((j, i) => ({ id: `J${String(i).padStart(5, '0')}`, ...j })),
      };
      lsSet(cle(edition), data);
    }
    if (!data) data = { parametres: { ...PARAMETRES_DEFAUT, edition }, references: {}, gies: {}, lignes: {}, lots: {}, journal: [] };
    window.addEventListener('storage', e => {
      if (e.key === cle(this.edition) && e.newValue) { etat = JSON.parse(e.newValue); notifier(); }
    });
    return data;
  },
  sauver() { lsSet(cle(this.edition), etat); notifier(); },
  async ecrire(ops) { appliquerLocal(ops); this.sauver(); },
  async journaliser(entrees) {
    const base = Date.now();
    entrees.forEach((e, i) => etat.journal.push({ id: `J${base}${i}`, ...e }));
    this.sauver();
  },
  async lireFormulaire(t) { return lsGet('reussites:formulaires', {})[t] || null; },
  async ecrireFormulaire(t, d) { const f = lsGet('reussites:formulaires', {}); f[t] = d; lsSet('reussites:formulaires', f); },
  async repondreFormulaire(t, reponse) {
    const f = lsGet('reussites:formulaires', {});
    if (!f[t]) throw new Error('Formulaire introuvable');
    f[t] = { ...f[t], reponse, statut: 'repondu', reponduLe: new Date().toISOString() };
    lsSet('reussites:formulaires', f);
  },
  async lireAcces() { return lsGet('reussites:acces', {}); },
  async ecrireAcces(email, role) { const a = lsGet('reussites:acces', {}); a[email] = { role }; lsSet('reussites:acces', a); },
  async supprimerAcces(email) { const a = lsGet('reussites:acces', {}); delete a[email]; lsSet('reussites:acces', a); },
  async listerEditions() {
    const eds = new Set(['2026']);
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^reussites:\d{4}$/.test(k)) eds.add(k.slice(10)); }
    return [...eds].sort();
  },
  async creerEdition(ed, donnees) { lsSet(cle(ed), { journal: [], lignes: {}, lots: {}, ...donnees }); },
  async importerJeu(ed, jeu) {
    lsSet(cle(ed), { parametres: { ...jeu.parametres, edition: ed }, references: Object.fromEntries(jeu.references.map(r => [r.id, r])), gies: jeu.gies, lignes: Object.fromEntries(jeu.lignes.map(l => [l.id, l])), lots: Object.fromEntries(jeu.lots.map(l => [l.id, l])), journal: jeu.journal.map((j, i) => ({ id: `J${i}`, ...j })) });
    return jeu.lignes.length;
  },
  reinitialiser() {
    Object.keys(localStorage).filter(k => k.startsWith('reussites:')).forEach(k => localStorage.removeItem(k));
  },
};

// ---------------------------------------------------------------- Firestore
async function firestore() {
  const { initializeApp, getApps } = await import(`${FB}/firebase-app.js`);
  const F = await import(`${FB}/firebase-firestore.js`);
  const app = getApps()[0] || initializeApp(FIREBASE);
  const db = F.getFirestore(app);
  let edition = null;
  const base = () => F.doc(db, COLL.editions, edition);

  return {
    async charger(ed, role) {
      edition = ed;
      const data = { parametres: { edition: ed }, references: {}, gies: {}, lignes: {}, lots: {}, journal: [] };
      const colls = role === 'usine' ? ['references', 'lots'] : COLLECTIONS;
      const premiers = [];
      const attendre = (q, cb) => new Promise(res => { let ok = false; F.onSnapshot(q, s => { cb(s); if (!ok) { ok = true; res(); } else { etat && notifier(); } }, err => { console.error(err); res(); }); });
      premiers.push(attendre(base(), s => { data.parametres = { ...PARAMETRES_DEFAUT, edition: ed, ...(s.exists() ? s.data() : {}) }; if (etat) etat.parametres = data.parametres; }));
      for (const c of colls) {
        const q = role === 'usine' && c === 'lots'
          ? F.query(F.collection(base(), c), F.where('statut', 'in', ['envoye', 'fabrication', 'expedie', 'recu']))
          : F.collection(base(), c);
        premiers.push(attendre(q, s => {
          const cible = etat ? etat[c] : data[c];
          s.docChanges().forEach(ch => { if (ch.type === 'removed') delete cible[ch.doc.id]; else cible[ch.doc.id] = ch.doc.data(); });
        }));
      }
      if (role !== 'usine') {
        premiers.push(attendre(F.query(F.collection(base(), 'journal'), F.orderBy('date')), s => {
          const cible = etat ? etat.journal : data.journal;
          s.docChanges().forEach(ch => { if (ch.type === 'added') cible.push({ id: ch.doc.id, ...ch.doc.data() }); });
        }));
      }
      await Promise.all(premiers);
      return data;
    },
    async ecrire(ops) {
      appliquerLocal(ops); notifier();
      for (let i = 0; i < ops.length; i += 450) {
        const b = F.writeBatch(db);
        for (const o of ops.slice(i, i + 450)) {
          const ref = o.coll === 'parametres' ? base() : F.doc(base(), o.coll, o.id);
          if (o.type === 'delete') b.delete(ref); else b.set(ref, nettoyer(o.data));
        }
        await b.commit();
      }
    },
    async journaliser(entrees) {
      for (let i = 0; i < entrees.length; i += 450) {
        const b = F.writeBatch(db);
        for (const e of entrees.slice(i, i + 450)) b.set(F.doc(F.collection(base(), 'journal')), nettoyer(e));
        await b.commit();
      }
    },
    async lireFormulaire(t) { const s = await F.getDoc(F.doc(db, COLL.formulaires, t)); return s.exists() ? s.data() : null; },
    async ecrireFormulaire(t, d) { await F.setDoc(F.doc(db, COLL.formulaires, t), nettoyer(d)); },
    async repondreFormulaire(t, reponse) {
      await F.updateDoc(F.doc(db, COLL.formulaires, t), { reponse: nettoyer(reponse), statut: 'repondu', reponduLe: new Date().toISOString() });
    },
    async lireAcces() { const s = await F.getDocs(F.collection(db, COLL.acces)); return Object.fromEntries(s.docs.map(d => [d.id, d.data()])); },
    async ecrireAcces(email, role) { await F.setDoc(F.doc(db, COLL.acces, email.toLowerCase()), { role }); },
    async supprimerAcces(email) { await F.deleteDoc(F.doc(db, COLL.acces, email)); },
    async listerEditions() { const s = await F.getDocs(F.collection(db, COLL.editions)); return s.docs.map(d => d.id).sort(); },
    async creerEdition(ed, donnees) {
      const ops = [{ coll: 'parametres', data: donnees.parametres }];
      for (const c of ['references', 'gies']) for (const [id, v] of Object.entries(donnees[c] || {})) ops.push({ coll: c, id, data: v });
      const ancien = edition; edition = ed;
      try {
        for (let i = 0; i < ops.length; i += 450) {
          const b = F.writeBatch(db);
          for (const o of ops.slice(i, i + 450)) b.set(o.coll === 'parametres' ? base() : F.doc(base(), o.coll, o.id), nettoyer(o.data));
          await b.commit();
        }
      } finally { edition = ancien; }
    },
    async importerJeu(ed, jeu) {
      const ops = [{ ref: F.doc(db, COLL.editions, ed), data: jeu.parametres }];
      for (const r of jeu.references) ops.push({ ref: F.doc(db, COLL.editions, ed, 'references', r.id), data: r });
      for (const [k, g] of Object.entries(jeu.gies)) ops.push({ ref: F.doc(db, COLL.editions, ed, 'gies', k), data: g });
      for (const l of jeu.lignes) ops.push({ ref: F.doc(db, COLL.editions, ed, 'lignes', l.id), data: l });
      for (const l of jeu.lots) ops.push({ ref: F.doc(db, COLL.editions, ed, 'lots', l.id), data: l });
      for (const j of jeu.journal) ops.push({ ref: F.doc(F.collection(db, COLL.editions, ed, 'journal')), data: j });
      for (let i = 0; i < ops.length; i += 450) {
        const b = F.writeBatch(db);
        ops.slice(i, i + 450).forEach(o => b.set(o.ref, nettoyer(o.data)));
        await b.commit();
      }
      return ops.length;
    },
  };
}

// Firestore refuse les valeurs undefined
function nettoyer(o) { return JSON.parse(JSON.stringify(o ?? null)); }

export async function implFormulaireFirestore() {
  const { initializeApp, getApps } = await import(`${FB}/firebase-app.js`);
  const F = await import(`${FB}/firebase-firestore.js`);
  const db = F.getFirestore(getApps()[0] || initializeApp(FIREBASE));
  return {
    async lireFormulaire(t) { const s = await F.getDoc(F.doc(db, COLL.formulaires, t)); return s.exists() ? s.data() : null; },
    async repondreFormulaire(t, reponse) {
      await F.updateDoc(F.doc(db, COLL.formulaires, t), { reponse: nettoyer(reponse), statut: 'repondu', reponduLe: new Date().toISOString() });
    },
  };
}
