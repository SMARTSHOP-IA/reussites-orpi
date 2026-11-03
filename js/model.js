// Calcul des données dérivées (références, incohérences, production, synthèse par GIE).
import {
  effectif, estActive, indexRefs, resoudreRef, detecterProblemes, niveauMax, numeroter, METAUX, normMetal, agenceAffichee,
} from './logic.js';

export const ETATS_PROD = {
  a_produire: { libelle: 'À produire', classe: 'gris' },
  brouillon: { libelle: 'Dans un lot en préparation', classe: 'bleu-clair' },
  produit: { libelle: 'Commandé à l\'usine', classe: 'vert' },
  complement: { libelle: 'Complément à produire (facturable)', classe: 'orange' },
  bloque: { libelle: 'Bloqué : référence inconnue', classe: 'rouge' },
  produit_inutile: { libelle: 'Produit puis supprimé', classe: 'violet' },
  supprime: { libelle: 'Supprimée', classe: 'gris' },
};
export const STATUTS_LOT = {
  brouillon: 'En préparation',
  envoye: "Envoyé à l'usine",
  fabrication: 'En fabrication',
  expedie: "Expédié par l'usine",
  recu: 'Reçu chez Smartshop',
};
export const STATUTS_FORM = {
  a_envoyer: 'À envoyer',
  envoye: 'Envoyé',
  repondu: 'Réponse reçue',
  valide: 'Validé',
};
export const STATUTS_EXPE = { a_preparer: 'À préparer', expedie: 'Expédié', livre: 'Livré' };
export const STATUTS_BAT = { a_faire: 'À faire', envoye: 'BAT envoyé', valide: 'BAT validé', imprime: 'Imprimés' };

export function calculer(etat) {
  const refsListe = Object.values(etat.references || {});
  const ordreMetaux = etat.parametres?.ordreMetaux || METAUX;
  const { tri: refsTri, num } = numeroter(refsListe, ordreMetaux);
  const idx = indexRefs(refsListe);
  const lignesBrutes = Object.values(etat.lignes || {});
  const problemes = detecterProblemes(lignesBrutes, refsListe, etat.gies);
  const lots = etat.lots || {};
  const lotsEnvoyesParGie = new Map();
  for (const lot of Object.values(lots)) {
    if (lot.statut === 'brouillon') continue;
    for (const g of lot.gies || []) { if (!lotsEnvoyesParGie.has(g)) lotsEnvoyesParGie.set(g, []); lotsEnvoyesParGie.get(g).push(lot); }
  }

  const parGie = {};
  const assurerGie = code => (parGie[code] ??= {
    code, gie: etat.gies?.[code], total: 0, metaux: { Platine: 0, Or: 0, Argent: 0, Bronze: 0 }, pb: { erreur: 0, alerte: 0, info: 0 },
    prod: { a_produire: 0, brouillon: 0, produit: 0, complement: 0, bloque: 0, produit_inutile: 0 }, lignes: [], nonAffectees: 0,
  });
  for (const code of Object.keys(etat.gies || {})) assurerGie(code);

  const lignes = lignesBrutes.map(l => {
    const e = effectif(l);
    const active = estActive(l);
    const { refId } = active ? resoudreRef(l, idx) : { refId: l.produit?.refId || null };
    const pb = problemes.get(l.id) || [];
    let prod;
    if (!active) prod = l.produit ? 'produit_inutile' : 'supprime';
    else if (!refId) prod = 'bloque';
    else if (l.produit && l.produit.refId === refId) prod = lots[l.produit.lotId]?.statut === 'brouillon' ? 'brouillon' : 'produit';
    else prod = (lotsEnvoyesParGie.has(e.gie) || l.produit) ? 'complement' : 'a_produire';
    const x = { l, e, id: l.id, active, refId, num: refId ? num[refId] : null, pb, niveau: niveauMax(pb), prod, gie: e.gie, metal: normMetal(e.recompense), agence: agenceAffichee(e.agence) };
    const g = assurerGie(e.gie);
    if (active) {
      g.total++;
      if (x.metal) g.metaux[x.metal]++;
      if (x.niveau) g.pb[x.niveau]++;
      g.lignes.push(x);
      if ((g.gie?.adresses?.length || 0) > 1 && (l.adresseIdx === undefined || l.adresseIdx === null)) g.nonAffectees++;
    }
    if (g.prod[prod] !== undefined) g.prod[prod]++;
    return x;
  });

  const stats = { total: 0, metaux: { Platine: 0, Or: 0, Argent: 0, Bronze: 0 }, erreur: 0, alerte: 0, info: 0, a_produire: 0, complement: 0, produit_inutile: 0, corrigees: 0, conflits: 0 };
  for (const x of lignes) {
    if (x.prod === 'produit_inutile') stats.produit_inutile++;
    if (!x.active) continue;
    stats.total++;
    if (x.metal) stats.metaux[x.metal]++;
    if (x.niveau) stats[x.niveau]++;
    if (x.prod === 'a_produire') stats.a_produire++;
    if (x.prod === 'complement') stats.complement++;
    if (Object.keys(x.l.ovr || {}).some(k => k !== 'supprime')) stats.corrigees++;
    if (x.l.conflits?.length) stats.conflits++;
  }
  const qteParRef = {};
  for (const x of lignes) if (x.active && x.refId) qteParRef[x.refId] = (qteParRef[x.refId] || 0) + 1;

  // Problèmes au niveau GIE
  for (const g of Object.values(parGie)) {
    const gie = g.gie;
    g.alertes = [];
    if (!gie) { g.alertes.push('GIE absent de la liste des régions'); continue; }
    if (g.total === 0) continue;
    if (!gie.contact?.email) g.alertes.push('E-mail du contact manquant');
    if (!(gie.adresses || []).some(a => a.texte)) g.alertes.push('Adresse de livraison manquante');
    if (g.nonAffectees) g.alertes.push(`${g.nonAffectees} trophée(s) sans adresse choisie`);
    const expes = gie.expeditions || [];
    g.expedition = expes.length ? (expes.every(x => x.statut === 'livre') ? 'livre' : expes.some(x => x.statut === 'expedie' || x.statut === 'livre') ? 'expedie' : 'a_preparer') : 'a_preparer';
    const lotsG = lotsEnvoyesParGie.get(g.code) || [];
    g.lots = lotsG;
    g.etatProd = g.prod.a_produire + g.prod.complement + g.prod.bloque > 0
      ? (lotsG.length ? 'complement' : 'a_produire')
      : (g.prod.brouillon ? 'brouillon' : (lotsG.length && lotsG.every(l => l.statut === 'recu') ? 'recu' : lotsG.length ? 'en_cours' : 'a_produire'));
  }

  const giesTries = Object.values(parGie).filter(g => g.gie).sort((a, b) => (a.gie.priorite || 999) - (b.gie.priorite || 999) || a.code.localeCompare(b.code));
  return { refsTri, num, idx, lignes, parGie, giesTries, stats, qteParRef, lotsEnvoyesParGie, ordreMetaux };
}

export function libelleRef(M, etat, refId) {
  const r = etat.references?.[refId];
  return r ? `${M.num[refId]} · ${r.metal} – ${r.libelle}` : '—';
}
