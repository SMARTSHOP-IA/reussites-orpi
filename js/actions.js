// Toutes les modifications de données passent par ici (écriture + journal).
import { store } from './store.js';
import {
  lireSource, comparer, appliquer, effectif, CHAMPS, CHAMPS_TROPHEE, agenceAffichee, norm, jeton, METAUX, normGie,
} from './logic.js';
import { calculer } from './model.js';
import { MODE, API_URL, COMPTE_ENVOI } from './config.js';
import { jetonGoogle } from './auth.js';
import { lireSheet, envoyerMail, appelerService } from './google.js';

export const session = { user: null };
const auteur = () => session.user?.nom || session.user?.email || 'Inconnu';
const maintenant = () => new Date().toISOString();
const E = () => store.etat;
const copie = o => JSON.parse(JSON.stringify(o));
const egal = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const nouvelIdLigne = () => `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function verifierDroits() {
  if (session.user?.role !== 'equipe') throw new Error('Action réservée à l\'équipe Smartshop');
}

// ======================================================== Synchronisation
export async function lireFichierClientGoogle(interactif) {
  const p = E().parametres;
  if (!p.sheetUrl) throw new Error('Lien du Google Sheet client non renseigné (Paramètres)');
  if (API_URL) return (await appelerService('/sheet', { url: p.sheetUrl, onglet: p.sheetOnglet })).values;
  const t = await jetonGoogle(interactif);
  if (!t) return null;
  return lireSheet(p.sheetUrl, p.sheetOnglet, t);
}

export async function synchroniser(tableau, origine = 'Google Sheet client') {
  verifierDroits();
  const { lignes: source, erreurs } = lireSource(tableau);
  if (erreurs.length) throw new Error(erreurs.join(' · '));
  if (!source.length) throw new Error('Aucune ligne lue dans le fichier client');
  const etat = E();
  const existantes = Object.values(etat.lignes);
  const premierImport = existantes.length === 0;
  const diff = comparer(existantes, source);
  const t = maintenant();
  const resume = { ajouts: diff.ajouts.length, modifications: diff.modifications.filter(m => m.champs.length).length, suppressions: diff.suppressions.length, origine };
  const ops = [];
  let journal = [];
  if (resume.ajouts + resume.modifications + resume.suppressions > 0) {
    const r = appliquer(existantes, diff, { maintenant: t, auteur: `Synchronisation (${origine})`, nouvelId: nouvelIdLigne });
    const touches = new Set([...diff.modifications.map(m => m.id), ...diff.suppressions]);
    for (const l of r.lignes) if (touches.has(l.id) || !etat.lignes[l.id]) ops.push({ type: 'set', coll: 'lignes', id: l.id, data: l });
    journal = premierImport
      ? [{ date: t, auteur: auteur(), type: 'import', gie: '', nom: '', changements: [{ champ: 'import', avant: '', apres: `${source.length} lignes importées (${origine})` }], trophee: false }]
      : r.journal;
    // Nouveaux GIE
    for (const s of source) {
      if (s.gie && !etat.gies[s.gie] && !ops.some(o => o.coll === 'gies' && o.id === s.gie)) {
        const prio = Math.max(0, ...Object.values(etat.gies).map(g => g.priorite || 0)) + 1;
        ops.push({ type: 'set', coll: 'gies', id: s.gie, data: nouveauGie(s.gie, s.gieNom, prio) });
        journal.push({ date: t, auteur: auteur(), type: 'gie', gie: s.gie, nom: s.gieNom, changements: [{ champ: 'gie', avant: '', apres: 'Nouveau GIE détecté dans le fichier client' }], trophee: false });
      }
    }
  }
  ops.push({ type: 'set', coll: 'parametres', data: { ...etat.parametres, derniereSynchro: t, dernierResume: resume } });
  await store.ecrire(ops);
  await store.journaliser(journal);
  return resume;
}

export function nouveauGie(code, nom, priorite) {
  return {
    code, nom: nom || '', contact: { nom: '', prenom: '', tel: '', email: '' },
    adresses: [{ libelle: 'Adresse de livraison', texte: '', contactSurPlace: '', tel: '' }],
    dateConvention: '', dateSouhaitee: '', souhaitTexte: '', priorite, commentaires: '',
    diplomes: { bat: 'a_faire' }, formulaire: { statut: 'a_envoyer' }, expeditions: [],
  };
}

// ======================================================== Lignes
export async function corrigerLigne(id, changements) {
  verifierDroits();
  const l = copie(E().lignes[id]);
  const avant = effectif(l);
  const ovr = { ...(l.ovr || {}) };
  const journalCh = [];
  for (const [k, v] of Object.entries(changements)) {
    if (!CHAMPS.includes(k)) continue;
    const val = k === 'gie' ? normGie(v) : v;
    if (egal(avant[k], val)) continue;
    if (l.src && egal(l.src[k], val)) delete ovr[k]; else ovr[k] = val;
    journalCh.push({ champ: k, avant: avant[k] ?? '', apres: val });
  }
  if (!journalCh.length) return;
  l.ovr = ovr;
  l.conflits = (l.conflits || []).filter(c => !(c.champ in changements));
  l.majLe = maintenant();
  await store.ecrire([{ type: 'set', coll: 'lignes', id, data: l }]);
  const trophee = journalCh.some(c => CHAMPS_TROPHEE.includes(c.champ));
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'correction', ligneId: id, gie: effectif(l).gie, nom: effectif(l).nom || agenceAffichee(effectif(l).agence), changements: journalCh, trophee, dejaProduit: trophee && !!l.produit }]);
}

export async function resoudreConflit(id, champ, choix) {
  verifierDroits();
  const l = copie(E().lignes[id]);
  const c = (l.conflits || []).find(x => x.champ === champ);
  if (!c) return;
  if (choix === 'client') delete l.ovr[champ];
  l.conflits = l.conflits.filter(x => x.champ !== champ);
  await store.ecrire([{ type: 'set', coll: 'lignes', id, data: l }]);
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'correction', ligneId: id, gie: effectif(l).gie, nom: effectif(l).nom, changements: [{ champ, avant: choix === 'client' ? c.corrige : c.client, apres: choix === 'client' ? `${c.client} (valeur client retenue)` : `${c.corrige} (correction conservée)` }], trophee: CHAMPS_TROPHEE.includes(champ) }]);
}

export async function forcerReference(id, refId) {
  verifierDroits();
  const l = copie(E().lignes[id]);
  if (refId) l.ovr.refManuel = refId; else delete l.ovr.refManuel;
  await store.ecrire([{ type: 'set', coll: 'lignes', id, data: l }]);
  const r = E().references[refId];
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'correction', ligneId: id, gie: effectif(l).gie, nom: effectif(l).nom, changements: [{ champ: 'refManuel', avant: '', apres: r ? `${r.metal} – ${r.libelle}` : 'Référence automatique' }], trophee: true, dejaProduit: !!l.produit }]);
}

export async function affecterAdresse(ids, idx) {
  verifierDroits();
  const ops = ids.map(id => ({ type: 'set', coll: 'lignes', id, data: { ...copie(E().lignes[id]), adresseIdx: idx === '' || idx === null ? null : Number(idx) } }));
  await store.ecrire(ops);
}

export async function supprimerLigne(id, retablir = false) {
  verifierDroits();
  const l = copie(E().lignes[id]);
  const e = effectif(l);
  if (retablir) delete l.ovr.supprime; else l.ovr.supprime = true;
  if (retablir && l.statut === 'supprimee' && l.origine !== 'manuel') l.statut = 'active';
  await store.ecrire([{ type: 'set', coll: 'lignes', id, data: l }]);
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: retablir ? 'retablissement' : 'suppression_manuelle', ligneId: id, gie: e.gie, nom: e.nom || agenceAffichee(e.agence), changements: [{ champ: 'supprime', avant: retablir ? 'Supprimée' : `${e.recompense} – ${e.categorie}`, apres: retablir ? `${e.recompense} – ${e.categorie}` : 'Supprimée' }], trophee: true, dejaProduit: !!l.produit }]);
}

export async function ajouterLigne(champs) {
  verifierDroits();
  const id = nouvelIdLigne();
  const ovr = Object.fromEntries(CHAMPS.filter(k => champs[k] !== undefined && champs[k] !== '').map(k => [k, k === 'gie' ? normGie(champs[k]) : champs[k]]));
  const l = { id, src: null, ovr, conflits: [], statut: 'active', origine: 'manuel', creeLe: maintenant(), majLe: maintenant(), produit: null };
  await store.ecrire([{ type: 'set', coll: 'lignes', id, data: l }]);
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'ajout_manuel', ligneId: id, gie: ovr.gie, nom: ovr.nom || agenceAffichee(ovr.agence), changements: [{ champ: 'recompense', avant: '', apres: `${ovr.recompense} – ${ovr.categorie}` }], trophee: true }]);
  return id;
}

// ======================================================== GIE
export async function majGie(code, modifs, libelleJournal) {
  verifierDroits();
  const g = { ...copie(E().gies[code]), ...modifs };
  await store.ecrire([{ type: 'set', coll: 'gies', id: code, data: g }]);
  if (libelleJournal) await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'gie', gie: code, nom: g.nom, changements: [{ champ: 'gie', avant: '', apres: libelleJournal }], trophee: false }]);
}

// ======================================================== Annuaire
export const CHAMPS_CONTACT = { prenom: 'Prénom', nom: 'Nom', fonction: 'Fonction', tel: 'Téléphone', email: 'E-mail', cc: 'E-mail en copie' };
export const emailValide = v => !v || String(v).split(/[,;]\s*/).every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()));

export async function majContact(code, modifs, { journal = true } = {}) {
  verifierDroits();
  const g = copie(E().gies[code]);
  const avant = { ...(g.contact || {}) };
  const contact = { ...avant };
  const changements = [];
  for (const [k, v] of Object.entries(modifs)) {
    if (!(k in CHAMPS_CONTACT)) continue;
    const val = String(v ?? '').trim();
    if ((avant[k] || '') === val) continue;
    if ((k === 'email' || k === 'cc') && !emailValide(val)) throw new Error(`Adresse e-mail invalide : ${val}`);
    contact[k] = val;
    changements.push({ champ: k, avant: avant[k] || '', apres: val });
  }
  if (!changements.length) return 0;
  g.contact = contact;
  await store.ecrire([{ type: 'set', coll: 'gies', id: code, data: g }]);
  if (journal) await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'gie', gie: code, nom: g.nom, changements: changements.map(c => ({ ...c, champ: `Contact – ${CHAMPS_CONTACT[c.champ]}` })), trophee: false }]);
  return changements.length;
}

// lignes : [{ code, prenom, nom, fonction, tel, email, cc }] — seuls les champs renseignés sont appliqués
export async function importerContacts(lignes, origine) {
  verifierDroits();
  const etat = E();
  const ops = [];
  const inconnus = [];
  const invalides = [];
  let maj = 0;
  for (const l of lignes) {
    const code = normGie(l.code);
    if (!etat.gies[code]) { if (code) inconnus.push(code); continue; }
    const g = copie(etat.gies[code]);
    const contact = { ...(g.contact || {}) };
    let change = false;
    for (const k of Object.keys(CHAMPS_CONTACT)) {
      const v = String(l[k] ?? '').trim();
      if (!v || contact[k] === v) continue;
      if ((k === 'email' || k === 'cc') && !emailValide(v)) { invalides.push(`${code} : ${v}`); continue; }
      contact[k] = v; change = true;
    }
    if (change) { g.contact = contact; ops.push({ type: 'set', coll: 'gies', id: code, data: g }); maj++; }
  }
  await store.ecrire(ops);
  if (maj) await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'gie', gie: '', nom: 'Annuaire', changements: [{ champ: 'Annuaire', avant: '', apres: `${maj} contact(s) GIE mis à jour par import (${origine})` }], trophee: false }]);
  return { maj, inconnus, invalides };
}

export async function ordonnerGies(codes) {
  verifierDroits();
  const ops = codes.map((c, i) => ({ type: 'set', coll: 'gies', id: c, data: { ...copie(E().gies[c]), priorite: i + 1 } }))
    .filter(o => E().gies[o.id].priorite !== o.data.priorite);
  await store.ecrire(ops);
}

export function agencesDuGie(code) {
  const M = calculer(E());
  const groupes = new Map();
  for (const x of M.parGie[code]?.lignes || []) {
    const k = norm(x.agence) || '(sans agence)';
    if (!groupes.has(k)) groupes.set(k, { cle: k, agence: x.agence || '(sans agence)', nb: 0, ids: [], adresseIdx: x.l.adresseIdx ?? null });
    const g = groupes.get(k);
    g.nb++; g.ids.push(x.id);
    if (g.adresseIdx !== (x.l.adresseIdx ?? null)) g.adresseIdx = 'mixte';
  }
  return [...groupes.values()].sort((a, b) => a.agence.localeCompare(b.agence));
}

export function lienFormulaire(token) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return `${base}formulaire.html?t=${token}${MODE === 'demo' ? '&demo=1' : ''}`;
}

function remplir(modele, v) {
  return String(modele || '').replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
}

// Prépare (et en production envoie) l'e-mail du formulaire de livraison. Renvoie le message.
export async function envoyerFormulaire(code, { relance = false, previsualiser = false } = {}) {
  verifierDroits();
  const etat = E();
  const g = copie(etat.gies[code]);
  const M = calculer(etat);
  const nb = M.parGie[code]?.total || 0;
  if (!g.contact?.email) throw new Error(`Pas d'e-mail pour le contact du GIE ${code}`);
  const token = g.formulaire?.token || jeton();
  const p = etat.parametres;
  const v = { prenom: g.contact.prenom || '', nom: g.contact.nom || '', gie: `${code} – ${g.nom}`, nb, lien: lienFormulaire(token), edition: p.edition, expediteur: p.expediteurNom || auteur() };
  const message = { a: g.contact.email, cc: g.contact.cc || '', objet: remplir(relance ? p.relanceObjet : p.mailObjet, v), corps: remplir(relance ? p.relanceCorps : p.mailCorps, v) };
  if (previsualiser) return { message, token };
  const existant = await store.lireFormulaire(token);
  await store.ecrireFormulaire(token, {
    edition: p.edition, gie: code, gieNom: g.nom, nb, agences: agencesDuGie(code).map(({ cle, agence, nb: n }) => ({ cle, agence, nb: n })),
    adresses: (g.adresses || []).map(a => ({ libelle: a.libelle || '', texte: a.texte || '', contactSurPlace: a.contactSurPlace || '', tel: a.tel || '' })),
    dateSouhaitee: g.dateSouhaitee || '', statut: existant?.statut === 'repondu' ? 'repondu' : 'envoye', reponse: existant?.reponse || null,
    reponduLe: existant?.reponduLe || null, envoyeLe: maintenant(),
  });
  if (MODE !== 'demo') {
    if (API_URL) await appelerService('/mail', { ...message, nomExpediteur: p.expediteurNom });
    else await envoyerMail(message, await jetonGoogle(true));
  }
  const f = g.formulaire || {};
  const { valideLe, reponduLe, reprise2026, ...fBase } = f;
  g.formulaire = { ...(relance ? f : fBase), token, statut: f.statut === 'repondu' ? 'repondu' : 'envoye', envoyeLe: f.envoyeLe && relance ? f.envoyeLe : maintenant(), relances: relance ? [...(f.relances || []), maintenant()] : (f.relances || []) };
  await store.ecrire([{ type: 'set', coll: 'gies', id: code, data: g }]);
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'formulaire', gie: code, nom: g.nom, changements: [{ champ: 'formulaire', avant: '', apres: `${relance ? 'Relance envoyée' : 'Formulaire envoyé'} à ${g.contact.email}${MODE === 'demo' ? ' (simulation)' : API_URL ? ` depuis ${COMPTE_ENVOI}` : ''}` }], trophee: false }]);
  return { message, token };
}

// Récupère les réponses arrivées depuis la dernière ouverture.
export async function verifierReponses() {
  if (session.user?.role !== 'equipe') return 0;
  let n = 0;
  for (const g of Object.values(E().gies)) {
    const f = g.formulaire;
    if (!f?.token || f.statut !== 'envoye') continue;
    const doc = await store.lireFormulaire(f.token);
    if (doc?.statut === 'repondu') {
      n++;
      await store.ecrire([{ type: 'set', coll: 'gies', id: g.code, data: { ...copie(g), formulaire: { ...f, statut: 'repondu', reponduLe: doc.reponduLe } } }]);
      await store.journaliser([{ date: maintenant(), auteur: 'Formulaire', type: 'formulaire', gie: g.code, nom: g.nom, changements: [{ champ: 'formulaire', avant: '', apres: 'Réponse reçue du contact GIE' }], trophee: false }]);
    }
  }
  return n;
}

export async function validerReponse(code) {
  verifierDroits();
  const g = copie(E().gies[code]);
  const doc = await store.lireFormulaire(g.formulaire.token);
  const r = doc?.reponse;
  if (!r) throw new Error('Aucune réponse à valider');
  g.dateSouhaitee = r.date || g.dateSouhaitee;
  g.adresses = (r.adresses || []).map((a, i) => ({
    libelle: a.libelle || g.adresses?.[i]?.libelle || `Adresse ${i + 1}`,
    texte: [a.societe, a.adresse, `${a.cp || ''} ${a.ville || ''}`.trim()].filter(Boolean).join('\n'),
    contactSurPlace: a.contact || '', tel: a.tel || '', email: a.email || '',
  }));
  if (r.commentaire) g.commentaires = [g.commentaires, `Formulaire : ${r.commentaire}`].filter(Boolean).join('\n');
  g.formulaire = { ...g.formulaire, statut: 'valide', valideLe: maintenant() };
  const ops = [{ type: 'set', coll: 'gies', id: code, data: g }];
  if (g.adresses.length > 1 && r.affectations) {
    for (const a of agencesDuGie(code)) {
      const idx = r.affectations[a.cle];
      if (idx === undefined) continue;
      for (const id of a.ids) ops.push({ type: 'set', coll: 'lignes', id, data: { ...copie(E().lignes[id]), adresseIdx: Number(idx) } });
    }
  } else if (g.adresses.length === 1) {
    // une seule adresse : on efface d'éventuelles affectations précédentes
  }
  await store.ecrire(ops);
  await store.ecrireFormulaire(g.formulaire.token, { ...doc, statut: 'valide' });
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'formulaire', gie: code, nom: g.nom, changements: [{ champ: 'formulaire', avant: '', apres: `Réponse validée : livraison souhaitée le ${r.date || '?'}, ${g.adresses.length} adresse(s)` }], trophee: false }]);
}

// ======================================================== Productions
export async function creerLot(codes, libelle) {
  verifierDroits();
  const etat = E();
  const M = calculer(etat);
  const lots = Object.values(etat.lots);
  const numero = Math.max(0, ...lots.map(l => l.numero || 0)) + 1;
  const id = `P${String(numero).padStart(3, '0')}`;
  const typesGie = {};
  const ops = [];
  for (const code of codes) {
    const aProduire = (M.parGie[code]?.lignes || []).filter(x => x.prod === 'a_produire' || x.prod === 'complement');
    if (!aProduire.length) continue;
    typesGie[code] = M.lotsEnvoyesParGie.has(code) || aProduire.some(x => x.prod === 'complement') ? 'complement' : 'initial';
    for (const x of aProduire) {
      const l = copie(x.l);
      if (l.produit) l.historiqueProd = [...(l.historiqueProd || []), l.produit];
      l.produit = { lotId: id, refId: x.refId, facturable: x.prod === 'complement' };
      ops.push({ type: 'set', coll: 'lignes', id: l.id, data: l });
    }
  }
  const gies = Object.keys(typesGie).sort();
  if (!gies.length) throw new Error('Aucun trophée à produire pour ces GIE');
  const types = new Set(Object.values(typesGie));
  const type = types.size > 1 ? 'mixte' : [...types][0];
  ops.push({ type: 'set', coll: 'lots', id, data: { id, numero, type, typesGie, libelle: libelle || `Lot ${numero}`, creeLe: maintenant(), statut: 'brouillon', gies, qte: {}, usine: { commentaire: '', dateExpedition: '' } } });
  await store.ecrire(ops);
  return id;
}

export function quantitesLot(lotId) {
  const etat = E();
  const lot = etat.lots[lotId];
  if (lot.statut !== 'brouillon') return lot.qte;
  const M = calculer(etat);
  const q = {};
  for (const x of M.lignes) {
    if (!x.active || x.l.produit?.lotId !== lotId || x.l.produit.refId !== x.refId) continue;
    q[x.refId] ??= {};
    q[x.refId][x.gie] = (q[x.refId][x.gie] || 0) + 1;
  }
  return q;
}

export async function envoyerLot(lotId) {
  verifierDroits();
  const etat = E();
  const M = calculer(etat);
  const qte = quantitesLot(lotId);
  const refs = Object.fromEntries(Object.keys(qte).map(r => [r, { num: M.num[r], metal: etat.references[r]?.metal, libelle: etat.references[r]?.libelle }]));
  const lot = { ...copie(etat.lots[lotId]), qte, refs, statut: 'envoye', envoyeLe: maintenant(), gies: Object.keys(Object.values(qte).reduce((a, o) => ({ ...a, ...o }), {})).sort() };
  const total = Object.values(qte).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b, 0), 0);
  await store.ecrire([{ type: 'set', coll: 'lots', id: lotId, data: lot }]);
  await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'production', gie: lot.gies.join(', '), nom: lot.libelle, changements: [{ champ: 'lot', avant: '', apres: `Lot n°${lot.numero} envoyé à l'usine : ${total} trophées (${lot.gies.length} GIE)` }], trophee: false }]);
}

export async function majLot(lotId, modifs, libelleJournal) {
  const etat = E();
  const lot = { ...copie(etat.lots[lotId]), ...modifs };
  await store.ecrire([{ type: 'set', coll: 'lots', id: lotId, data: lot }]);
  if (libelleJournal && session.user?.role === 'equipe') await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'production', gie: lot.gies.join(', '), nom: lot.libelle, changements: [{ champ: 'lot', avant: '', apres: libelleJournal }], trophee: false }]);
}

export async function supprimerLot(lotId) {
  verifierDroits();
  const etat = E();
  if (etat.lots[lotId].statut !== 'brouillon') throw new Error('Seul un lot en préparation peut être supprimé');
  const ops = [];
  for (const l of Object.values(etat.lignes)) {
    if (l.produit?.lotId !== lotId) continue;
    const c = copie(l);
    const hist = c.historiqueProd || [];
    c.produit = hist.length ? hist.pop() : null;
    c.historiqueProd = hist;
    ops.push({ type: 'set', coll: 'lignes', id: c.id, data: c });
  }
  ops.push({ type: 'delete', coll: 'lots', id: lotId });
  await store.ecrire(ops);
}

// ======================================================== Expéditions
export async function majExpedition(code, i, modifs) {
  verifierDroits();
  const g = copie(E().gies[code]);
  g.expeditions ??= [];
  while (g.expeditions.length <= i) g.expeditions.push({ adresseIdx: g.expeditions.length, transporteur: '', numero: '', nbColis: null, dateEnvoi: '', dateLivraison: '', statut: 'a_preparer' });
  g.expeditions[i] = { ...g.expeditions[i], ...modifs };
  await store.ecrire([{ type: 'set', coll: 'gies', id: code, data: g }]);
  if (modifs.statut) await store.journaliser([{ date: maintenant(), auteur: auteur(), type: 'expedition', gie: code, nom: g.nom, changements: [{ champ: 'expedition', avant: '', apres: `Colis ${modifs.statut === 'livre' ? 'livré' : modifs.statut === 'expedie' ? 'expédié' : 'à préparer'}${g.expeditions[i].numero ? ` (${g.expeditions[i].transporteur} ${g.expeditions[i].numero})` : ''}` }], trophee: false }]);
}

// ======================================================== Références
export async function ajouterReference(metal, libelle, regles = []) {
  verifierDroits();
  const refs = Object.values(E().references);
  const ordre = Math.max(0, ...refs.filter(r => r.metal === metal).map(r => r.ordre)) + 10;
  let n = refs.length + 1;
  while (E().references[`R${String(n).padStart(3, '0')}`]) n++;
  const id = `R${String(n).padStart(3, '0')}`;
  await store.ecrire([{ type: 'set', coll: 'references', id, data: { id, metal, ordre, libelle, regles } }]);
  return id;
}
export async function majReference(id, modifs) {
  verifierDroits();
  await store.ecrire([{ type: 'set', coll: 'references', id, data: { ...copie(E().references[id]), ...modifs } }]);
}
export async function deplacerReference(id, sens) {
  verifierDroits();
  const r = E().references[id];
  const memes = Object.values(E().references).filter(x => x.metal === r.metal).sort((a, b) => a.ordre - b.ordre);
  const i = memes.findIndex(x => x.id === id);
  const j = i + sens;
  if (j < 0 || j >= memes.length) return;
  const autre = memes[j];
  await store.ecrire([
    { type: 'set', coll: 'references', id: r.id, data: { ...copie(r), ordre: autre.ordre } },
    { type: 'set', coll: 'references', id: autre.id, data: { ...copie(autre), ordre: r.ordre } },
  ]);
}
export async function supprimerReference(id) {
  verifierDroits();
  await store.ecrire([{ type: 'delete', coll: 'references', id }]);
}

// ======================================================== Paramètres & éditions
export async function majParametres(modifs) {
  verifierDroits();
  await store.ecrire([{ type: 'set', coll: 'parametres', data: { ...copie(E().parametres), ...modifs } }]);
}

export async function nouvelleEdition(annee) {
  verifierDroits();
  const etat = E();
  const gies = {};
  for (const [code, g] of Object.entries(etat.gies)) {
    gies[code] = { ...nouveauGie(code, g.nom, g.priorite), contact: copie(g.contact || {}), adresses: (g.adresses || []).map(a => ({ ...a })) };
  }
  await store.creerEdition(String(annee), {
    parametres: { ...copie(etat.parametres), edition: String(annee), derniereSynchro: null, dernierResume: null, sheetUrl: '' },
    references: copie(etat.references),
    gies,
  });
}

export { METAUX };
