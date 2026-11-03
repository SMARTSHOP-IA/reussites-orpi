// Moteur métier Réussites Orpi — fonctions pures, utilisables dans le navigateur et sous Node.
// Aucune dépendance : pas d'accès réseau ni à la base ici.

export const METAUX = ['Bronze', 'Argent', 'Or', 'Platine'];
export const CHAMPS = ['gie', 'gieNom', 'codeAgence', 'agence', 'civilite', 'nom', 'ca', 'uv', 'categorie', 'recompense'];
export const LIBELLES_CHAMPS = {
  gie: 'Code GIE', gieNom: 'Nom GIE', codeAgence: 'Code agence', agence: 'Agence', civilite: 'Civilité',
  nom: 'Nom', ca: 'CA HT', uv: 'Nb UV', categorie: 'Catégorie', recompense: 'Métal',
  adresseIdx: 'Adresse de livraison', refManuel: 'Référence forcée', supprime: 'Suppression',
};
// Champs qui changent le trophée à produire (les autres n'influent que sur les diplômes ou l'info).
export const CHAMPS_TROPHEE = ['gie', 'civilite', 'categorie', 'recompense'];

// ---------- Normalisation ----------
export function sansAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export function norm(s) {
  return sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function normNom(s) {
  return sansAccents(s).toUpperCase().replace(/[^A-Z]/g, '');
}
export function normGie(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return /^\d+$/.test(s) ? s.padStart(3, '0') : s;
}
export function normCiv(v) {
  const n = norm(v);
  if (['madame', 'mme', 'mlle', 'mademoiselle', 'f'].includes(n)) return 'F';
  if (['monsieur', 'm', 'mr', 'h'].includes(n)) return 'M';
  return '';
}
export function normMetal(v) {
  const n = norm(v);
  if (n.startsWith('plat')) return 'Platine';
  if (n === 'or' || n.startsWith('or ')) return 'Or';
  if (n.startsWith('arg')) return 'Argent';
  if (n.startsWith('bron')) return 'Bronze';
  return '';
}
const FEMININS = [
  [/\bconseillere\b/g, 'conseiller'], [/\bassociee\b/g, 'associe'], [/\bassistante\b/g, 'assistant'],
  [/\bcreatrice\b/g, 'createur'], [/\bcommerciale\b/g, 'commercial'],
];
// Ramène une catégorie client à sa forme masculine (forme utilisée dans les règles des références).
export function catCle(cat) {
  let n = norm(cat);
  let fem = false;
  for (const [re, m] of FEMININS) {
    if (re.test(n)) { fem = true; n = n.replace(re, m); }
    re.lastIndex = 0;
  }
  return { cle: n, feminin: fem };
}
export function agenceAffichee(nom) {
  return String(nom ?? '').replace(/^\s*\d{4,6}\s*-\s*/, '').trim();
}
function numDansNomAgence(nom) {
  const m = String(nom ?? '').match(/^\s*(\d{4,6})\s*-/);
  return m ? Number(m[1]) : null;
}

// ---------- Lecture du Google Sheet / fichier client ----------
const ALIAS_COLONNES = {
  gie: ['gie_code', 'code gie', 'gie'],
  gieNom: ['gie_nom', 'nom gie'],
  codeAgence: ['code agence', 'code_agence'],
  agence: ['nom agence', 'agence', 'nom_agence'],
  civilite: ['titre_conseiller', 'civilite', 'titre conseiller'],
  nom: ['nom associe collaborateur', 'nom', 'collaborateur'],
  ca: ['ca_totalht', 'ca totalht', 'ca'],
  uv: ['nb_uv', 'nb uv'],
  categorie: ['categorie'],
  recompense: ['recompense', 'metal'],
};

// tableau = tableau de lignes (tableaux de cellules), la 1re ligne contenant les en-têtes.
export function lireSource(tableau) {
  if (!tableau?.length) return { lignes: [], erreurs: ['Fichier vide'] };
  const iEntete = tableau.findIndex(l => l.some(c => norm(c) === 'gie_code' || norm(c) === 'gie code' || norm(c) === 'categorie'));
  const entete = (tableau[Math.max(iEntete, 0)] || []).map(c => norm(c).replace(/ /g, ' '));
  const pos = {};
  const erreurs = [];
  for (const [champ, alias] of Object.entries(ALIAS_COLONNES)) {
    const i = entete.findIndex(h => alias.map(a => norm(a)).includes(h));
    if (i >= 0) pos[champ] = i; else if (champ !== 'ca' && champ !== 'uv') erreurs.push(`Colonne introuvable : ${alias[0]}`);
  }
  const lignes = [];
  tableau.slice(Math.max(iEntete, 0) + 1).forEach((l, k) => {
    const cell = c => (pos[c] === undefined ? '' : l[pos[c]]);
    const brut = {
      gie: cell('gie'), gieNom: cell('gieNom'), codeAgence: cell('codeAgence'), agence: cell('agence'),
      civilite: cell('civilite'), nom: cell('nom'), ca: cell('ca'), uv: cell('uv'),
      categorie: cell('categorie'), recompense: cell('recompense'),
    };
    if (!brut.gie && !brut.nom && !brut.categorie && !brut.recompense) return;
    lignes.push(nettoyerSource(brut, k + Math.max(iEntete, 0) + 2));
  });
  return { lignes, erreurs };
}

export function nettoyerSource(b, numLigne) {
  const s = v => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  const n = v => {
    if (v === '' || v === null || v === undefined) return null;
    const x = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
  };
  const ca = String(b.codeAgence ?? '').trim();
  return {
    gie: normGie(b.gie), gieBrut: s(b.gie), gieNom: s(b.gieNom),
    codeAgence: /^\d+(\.0+)?$/.test(ca) ? String(parseInt(ca, 10)) : s(ca),
    agence: s(b.agence), civilite: s(b.civilite), nom: s(b.nom),
    ca: n(b.ca), uv: n(b.uv), categorie: s(b.categorie), recompense: s(b.recompense),
    _ligne: numLigne,
  };
}

// ---------- Lignes : valeurs effectives ----------
export function effectif(ligne) {
  const e = { ...(ligne.src || {}) };
  for (const [k, v] of Object.entries(ligne.ovr || {})) if (CHAMPS.includes(k)) e[k] = v;
  return e;
}
export function estActive(ligne) {
  return ligne.statut !== 'supprimee' && !(ligne.ovr && ligne.ovr.supprime);
}

// ---------- Références trophées ----------
// refs : [{id, metal, ordre, libelle, regles:[{cat, civ:'M'|'F'|'*'}]}]
export function numeroter(refs, ordreMetaux = METAUX) {
  const tri = [...refs].sort((a, b) =>
    (ordreMetaux.indexOf(a.metal) - ordreMetaux.indexOf(b.metal)) || (a.ordre - b.ordre));
  const num = {};
  tri.forEach((r, i) => { num[r.id] = i + 1; });
  return { tri, num };
}

export function indexRefs(refs) {
  const idx = new Map(); // "metal|cat" -> [{civ, id}]
  for (const r of refs) for (const g of r.regles || []) {
    const k = `${r.metal}|${catCle(g.cat).cle}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push({ civ: g.civ || '*', id: r.id });
  }
  return idx;
}

// Renvoie { refId, probleme } ; probleme ∈ METAL_INCONNU | CAT_INCONNUE | CIV_MANQUANTE | null
export function resoudreRef(ligne, idx) {
  if (ligne.ovr?.refManuel) return { refId: ligne.ovr.refManuel, probleme: null, manuel: true };
  const e = effectif(ligne);
  const metal = normMetal(e.recompense);
  if (!metal) return { refId: null, probleme: 'METAL_INCONNU' };
  const { cle } = catCle(e.categorie);
  const cands = idx.get(`${metal}|${cle}`);
  if (!cands?.length) return { refId: null, probleme: 'CAT_INCONNUE' };
  const civ = normCiv(e.civilite);
  const exact = cands.find(c => c.civ === civ);
  if (exact) return { refId: exact.id, probleme: null };
  const tous = cands.find(c => c.civ === '*');
  if (tous) return { refId: tous.id, probleme: null };
  if (cands.length === 1) return { refId: cands[0].id, probleme: civ ? null : 'CIV_MANQUANTE' };
  return { refId: null, probleme: 'CIV_MANQUANTE' };
}

// ---------- Incohérences ----------
export const PROBLEMES = {
  CONFLIT: { niveau: 'erreur', libelle: 'Correction manuelle contredite par une modification du client' },
  METAL_INCONNU: { niveau: 'erreur', libelle: 'Métal non reconnu' },
  CAT_INCONNUE: { niveau: 'erreur', libelle: 'Catégorie sans référence trophée pour ce métal' },
  CIV_MANQUANTE: { niveau: 'erreur', libelle: 'Civilité manquante : impossible de choisir la référence (masculin/féminin)' },
  GIE_INCONNU: { niveau: 'erreur', libelle: 'Code GIE inconnu' },
  CIV_INCOHERENTE: { niveau: 'alerte', libelle: 'Titre et civilité incohérents' },
  NOM_MANQUANT: { niveau: 'alerte', libelle: 'Nom du lauréat manquant' },
  DOUBLON: { niveau: 'alerte', libelle: 'Doublon possible (même GIE, nom, catégorie et métal)' },
  ADRESSE: { niveau: 'alerte', libelle: 'GIE livré à 2 adresses : adresse non choisie' },
  GIE_FORMAT: { niveau: 'info', libelle: 'Code GIE mal saisi dans le fichier client' },
  CODE_AGENCE: { niveau: 'info', libelle: "Code agence différent du numéro dans le nom d'agence" },
};

const CATS_AGENCE = /^(agence|point de vente|groupe)/;

export function detecterProblemes(lignes, refs, gies) {
  const idx = indexRefs(refs);
  const giesConnus = new Set(Object.keys(gies || {}));
  const res = new Map();
  const vus = new Map();
  for (const l of lignes) {
    if (!estActive(l)) continue;
    const e = effectif(l);
    const pb = [];
    const r = resoudreRef(l, idx);
    if (r.probleme) pb.push(r.probleme);
    if (l.conflits?.length) pb.push('CONFLIT');
    if (gies && !giesConnus.has(e.gie)) pb.push('GIE_INCONNU');
    if (l.src && l.src.gieBrut && normGie(l.src.gieBrut) !== l.src.gieBrut) pb.push('GIE_FORMAT');
    const { cle, feminin } = catCle(e.categorie);
    const civ = normCiv(e.civilite);
    if (feminin && civ === 'M') pb.push('CIV_INCOHERENTE');
    const agence = CATS_AGENCE.test(cle);
    if (!agence && !e.nom) pb.push('NOM_MANQUANT');
    const num = numDansNomAgence(e.agence);
    if (num && e.codeAgence && Number(e.codeAgence) !== num) pb.push('CODE_AGENCE');
    const g = gies?.[e.gie];
    if (g && (g.adresses?.length || 0) > 1 && (l.adresseIdx === undefined || l.adresseIdx === null)) pb.push('ADRESSE');
    if (e.nom) {
      const k = [e.gie, normNom(e.nom), cle, normMetal(e.recompense)].join('|');
      if (vus.has(k)) { pb.push('DOUBLON'); const autre = res.get(vus.get(k)); if (autre && !autre.includes('DOUBLON')) autre.push('DOUBLON'); }
      else vus.set(k, l.id);
    }
    res.set(l.id, pb);
  }
  return res;
}

export function niveauMax(codes) {
  if (!codes?.length) return null;
  if (codes.some(c => PROBLEMES[c]?.niveau === 'erreur')) return 'erreur';
  if (codes.some(c => PROBLEMES[c]?.niveau === 'alerte')) return 'alerte';
  return 'info';
}

// ---------- Comparaison avec le fichier client ----------
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
export function similarite(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Similarité de deux noms : tolère l'ordre inversé (NOM Prénom / Prénom NOM) et les prénoms composés tronqués.
export function similariteNoms(a, b) {
  const A = normNom(a), B = normNom(b);
  if (!A || !B) return A === B ? 1 : 0;
  const tri = s => sansAccents(s).toUpperCase().split(/[^A-Z]+/).filter(Boolean).sort().join('');
  let sim = Math.max(similarite(A, B), similarite(tri(a), tri(b)));
  const [court, long] = A.length <= B.length ? [A, B] : [B, A];
  if (court.length >= 5 && long.includes(court)) sim = Math.max(sim, 0.85);
  return sim;
}

function cleExacte(s) {
  return [s.gie, s.codeAgence, normNom(s.nom), catCle(s.categorie).cle, normMetal(s.recompense), normCiv(s.civilite), norm(agenceAffichee(s.agence))].join('|');
}

function score(s, l) {
  if (s.gie !== l.gie) return 0;
  const na = normNom(s.nom), nb = normNom(l.nom);
  const simNom = similariteNoms(s.nom, l.nom);
  const memeCat = catCle(s.categorie).cle === catCle(l.categorie).cle;
  const memeMetal = normMetal(s.recompense) === normMetal(l.recompense);
  const memeAgence = (s.codeAgence && s.codeAgence === l.codeAgence) ||
    similarite(norm(agenceAffichee(s.agence)), norm(agenceAffichee(l.agence))) > 0.85;
  let sc = 0;
  if (na && nb) {
    if (simNom === 1) sc += 6; else if (simNom >= 0.75) sc += 4; else return 0;
  } else if (!na && !nb) {
    if (!memeAgence) return 0;
    sc += 2;
  } else {
    // nom ajouté ou retiré : on n'accepte que si tout le reste concorde
    if (!(memeAgence && memeCat && memeMetal)) return 0;
    sc += 1;
  }
  if (memeCat) sc += 2;
  if (memeMetal) sc += 2;
  if (memeAgence) sc += 2;
  if (normCiv(s.civilite) === normCiv(l.civilite)) sc += 1;
  return sc >= 6 ? sc : 0;
}

function egal(a, b) {
  const v = x => (x === null || x === undefined ? '' : String(x).trim());
  return v(a) === v(b);
}

// lignes : lignes existantes ; source : lignes nettoyées du fichier client.
// Renvoie { ajouts:[src], suppressions:[id], modifications:[{id, avant, apres, champs}], inchangees }
export function comparer(lignes, source) {
  const candidates = lignes.filter(l => l.src && l.statut !== 'supprimee');
  const parCle = new Map();
  for (const l of candidates) {
    const k = cleExacte(l.src);
    if (!parCle.has(k)) parCle.set(k, []);
    parCle.get(k).push(l);
  }
  const prises = new Set();
  const restes = [];
  const modifications = [];
  let inchangees = 0;
  const diffChamps = (avant, apres) => CHAMPS.filter(c => !egal(avant[c], apres[c]));
  for (const s of source) {
    const liste = parCle.get(cleExacte(s));
    const l = liste?.find(x => !prises.has(x.id));
    if (l) {
      prises.add(l.id);
      const ch = diffChamps(l.src, s);
      if (ch.length) modifications.push({ id: l.id, avant: l.src, apres: s, champs: ch });
      else inchangees++;
    } else restes.push(s);
  }
  // 2e passe : rapprochement approché (modification de métal, catégorie, orthographe…)
  const libres = candidates.filter(l => !prises.has(l.id));
  const paires = [];
  restes.forEach((s, i) => {
    for (const l of libres) {
      const sc = score(s, l.src);
      if (sc) paires.push({ i, l, sc });
    }
  });
  paires.sort((a, b) => b.sc - a.sc);
  const sourcePrise = new Set();
  for (const p of paires) {
    if (sourcePrise.has(p.i) || prises.has(p.l.id)) continue;
    sourcePrise.add(p.i); prises.add(p.l.id);
    const s = restes[p.i];
    modifications.push({ id: p.l.id, avant: p.l.src, apres: s, champs: diffChamps(p.l.src, s) });
  }
  const ajouts = restes.filter((_, i) => !sourcePrise.has(i));
  const suppressions = candidates.filter(l => !prises.has(l.id)).map(l => l.id);
  return { ajouts, suppressions, modifications, inchangees };
}

// Applique une comparaison. Renvoie { lignes (nouvel état complet), journal:[entrées] }.
// Les corrections manuelles (ovr) sont conservées ; si le client modifie un champ corrigé :
//  - nouvelle valeur client = valeur corrigée → la correction devient inutile et est retirée ;
//  - sinon → la correction est gardée et un conflit est signalé.
export function appliquer(lignes, diff, { maintenant, auteur = 'Synchronisation', nouvelId }) {
  const parId = new Map(lignes.map(l => [l.id, { ...l }]));
  const journal = [];
  for (const m of diff.modifications) {
    const l = parId.get(m.id);
    const ovr = { ...(l.ovr || {}) };
    const conflits = [...(l.conflits || [])].filter(c => !m.champs.includes(c.champ));
    const champsUtiles = m.champs.filter(c => c !== '_ligne' && c !== 'gieBrut');
    for (const c of champsUtiles) {
      if (c in ovr) {
        if (egal(ovr[c], m.apres[c])) delete ovr[c];
        else conflits.push({ champ: c, client: m.apres[c], corrige: ovr[c], avant: m.avant[c] });
      }
    }
    const { _ligne, ...src } = m.apres;
    parId.set(m.id, { ...l, src, ovr, conflits, ligneSource: _ligne, majLe: maintenant });
    if (champsUtiles.length) {
      journal.push({
        date: maintenant, auteur, type: 'modification', ligneId: m.id, gie: src.gie,
        nom: src.nom || agenceAffichee(src.agence),
        changements: champsUtiles.map(c => ({ champ: c, avant: m.avant[c] ?? '', apres: m.apres[c] ?? '' })),
        trophee: champsUtiles.some(c => CHAMPS_TROPHEE.includes(c)),
      });
    }
  }
  for (const id of diff.suppressions) {
    const l = parId.get(id);
    parId.set(id, { ...l, statut: 'supprimee', majLe: maintenant });
    journal.push({
      date: maintenant, auteur, type: 'suppression', ligneId: id, gie: l.src.gie,
      nom: l.src.nom || agenceAffichee(l.src.agence),
      changements: [{ champ: 'recompense', avant: `${l.src.recompense} – ${l.src.categorie}`, apres: '' }],
      trophee: true, dejaProduit: !!l.produit,
    });
  }
  for (const s of diff.ajouts) {
    const id = nouvelId();
    const { _ligne, ...src } = s;
    parId.set(id, { id, src, ovr: {}, conflits: [], statut: 'active', origine: 'client', ligneSource: _ligne, creeLe: maintenant, majLe: maintenant, produit: null });
    journal.push({
      date: maintenant, auteur, type: 'ajout', ligneId: id, gie: src.gie, nom: src.nom || agenceAffichee(src.agence),
      changements: [{ champ: 'recompense', avant: '', apres: `${src.recompense} – ${src.categorie}` }], trophee: true,
    });
  }
  return { lignes: [...parId.values()], journal };
}

// ---------- Production ----------
// Une ligne est « à produire » si elle est active, a une référence, et n'a pas encore été produite
// avec cette référence (un changement de métal/catégorie après production = nouveau trophée facturable).
export function etatProduction(ligne, refId, lotsEnvoyes) {
  const active = estActive(ligne);
  if (!active) return ligne.produit ? 'produit_inutile' : 'aucun';
  if (!refId) return 'bloque';
  if (ligne.produit && ligne.produit.refId === refId) return 'produit';
  if (ligne.lotBrouillon) return 'brouillon';
  return lotsEnvoyes.has(ligne.src?.gie ?? effectif(ligne).gie) || ligne.produit ? 'complement' : 'a_produire';
}

// Quantités par référence et par GIE pour un ensemble de lignes déjà résolues.
export function quantites(items) {
  const q = {};
  for (const { refId, gie } of items) {
    if (!refId) continue;
    q[refId] ??= {};
    q[refId][gie] = (q[refId][gie] || 0) + 1;
  }
  return q;
}

// ---------- Transporteurs ----------
export const TRANSPORTEURS = {
  Colissimo: 'https://www.laposte.fr/outils/suivre-vos-envois?code={n}',
  Chronopost: 'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={n}',
  DPD: 'https://trace.dpd.fr/fr/trace/{n}',
  UPS: 'https://www.ups.com/track?loc=fr_FR&tracknum={n}',
  DHL: 'https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={n}',
  TNT: 'https://www.tnt.com/express/fr_fr/site/outils-expedition/suivi.html?searchType=con&cons={n}',
  GLS: 'https://gls-group.com/FR/fr/suivi-colis?match={n}',
  'DB Schenker': 'https://www.dbschenker.com/app/tracking-public/?refNumber={n}',
  Autre: '',
};
export function lienSuivi(transporteur, numero) {
  const t = TRANSPORTEURS[transporteur];
  return t && numero ? t.replace('{n}', encodeURIComponent(numero)) : '';
}

export function jeton(n = 24) {
  const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(n);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(buf);
  return Array.from(buf, b => a[b % a.length]).join('');
}
