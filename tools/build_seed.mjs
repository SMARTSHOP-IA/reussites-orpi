// Construit le jeu de données de démonstration 2026 à partir du JSON brut extrait des fichiers XLSX.
// Usage : node tools/build_seed.mjs raw2026.json data/seed-2026.json
import fs from 'node:fs';
import {
  nettoyerSource, comparer, catCle, normCiv, normMetal, normNom, indexRefs, resoudreRef, effectif, estActive, agenceAffichee,
} from '../js/logic.js';

const [, , entree, sortie] = process.argv;
const raw = JSON.parse(fs.readFileSync(entree, 'utf8'));
const MAINTENANT = '2026-11-03T12:00:00.000Z';
let compteur = 0;
const nouvelId = () => `L${String(++compteur).padStart(5, '0')}`;

// ---------- Références ----------
// Libellé trophée -> catégorie du fichier client + civilité
const REGLES = {
  'conseiller transaction': [['Conseiller en transaction', 'M']],
  'conseillere transaction': [['Conseiller en transaction', 'F']],
  'associe transaction': [['Associé en transaction', 'M']],
  'associee transaction': [['Associé en transaction', 'F']],
  'gestionnaire locatif': [['Gestionnaire Locatif', '*']],
  'gestionnaire syndic': [['Gestionnaire Syndic', '*']],
  'conseiller location': [['Conseiller en location', 'M']],
  'conseillere location': [['Conseiller en location', 'F']],
  'categorie conseiller location': [['Conseiller en location', 'M']],
  'categorie conseillere location': [['Conseiller en location', 'F']],
  'conseiller immobilier professionnel': [['Conseiller en immobilier professionnel', 'M']],
  'conseillere immobilier professionnel': [['Conseiller en immobilier professionnel', 'F']],
  'associe immobilier professionnel': [['Associé en immobilier professionnel', 'M']],
  'associee immobilier professionnel': [['Associé en immobilier professionnel', 'F']],
  'espoir transaction': [['Jeune espoir Transaction', '*']],
  location: [['Agence location', '*']],
  'categorie location': [['Agence location', '*']],
  'assistant commercial': [['Assistant commercial', 'M']],
  'assistante commerciale': [['Assistant commercial', 'F']],
  'assistant gestion locative': [['Assistant gestion locative', 'M']],
  'assistante gestion locative': [['Assistant gestion locative', 'F']],
  'assistant de copropriete': [['Assistant copropriété', 'M']],
  'assistante de copropriete': [['Assistant copropriété', 'F']],
  'comptable copropriete': [['Comptable copropriété', '*']],
  'comptable gestion locative': [['Comptable Gestion Locative', '*']],
  'gestion locative': [['Agence Gestion Locative', '*']],
  'immobilier professionnel': [['Agence en Immobilier Professionnel', '*']],
  syndic: [['Agence Syndic', '*']],
  'categorie syndic': [['Agence Syndic', '*']],
  'point de vente transaction': [['Point de vente transaction', '*']],
  'groupe immobilier': [['Groupe en Immobilier', '*']],
  'location saisonniere': [['Agence Location Saisonnière', '*']],
  createur: [['Créateur', 'M']],
  creatrice: [['Créateur', 'F']],
};
const n = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const ordreParMetal = {};
const references = raw.references.map(r => {
  ordreParMetal[r.metal] = (ordreParMetal[r.metal] || 0) + 1;
  const libelle = r.libelle.replace(/^Catégorie /, '');
  const regles = REGLES[n(r.libelle)];
  if (!regles) throw new Error(`Pas de règle pour ${r.libelle}`);
  return {
    id: `R${String(r.num).padStart(3, '0')}`, metal: r.metal, ordre: ordreParMetal[r.metal] * 10, libelle,
    regles: regles.map(([cat, civ]) => ({ cat, civ })),
  };
});
const idx = indexRefs(references);

// ---------- GIE ----------
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const rangMois = v => { const k = MOIS.findIndex(m => n(String(v || '')).includes(m)); return k < 0 ? 99 : k; };
const gies = {};
for (const g of raw.gies) {
  const lv = raw.livraisons.find(x => x.code === g.code) || {};
  const contact = String(lv.contact ?? '');
  const emails = contact.match(/[\w.+-]+@[\w.-]+/g) || [];
  const tel = emails.length ? '' : contact.replace(/^(\d{9})$/, '0$1');
  let adresses = [{ libelle: 'Adresse de livraison', texte: lv.adresse || g.adresse || '', contactSurPlace: '', tel: '' }];
  if (g.code === '048') adresses = [
    { libelle: 'Agence Accueil 57', texte: '', contactSurPlace: '', tel: '' },
    { libelle: 'Agence Réussite', texte: '', contactSurPlace: '', tel: '' }];
  if (g.code === '101') adresses = [
    { libelle: 'Périgueux', texte: '', contactSurPlace: '', tel: '' },
    { libelle: 'Brive', texte: '', contactSurPlace: '', tel: '' }];
  const livre = g.statut === 'Trophées livrés';
  gies[g.code] = {
    code: g.code, nom: g.nom,
    contact: { nom: lv.nom || '', prenom: lv.prenom || '', tel, email: emails.join(', ') },
    adresses,
    dateConvention: lv.convention || '',
    dateSouhaitee: '', souhaitTexte: lv.priorite || g.souhait || '',
    priorite: 0,
    commentaires: g.commentaires || '',
    diplomes: { bat: g.bat === 'Imprimés' ? 'imprime' : 'a_faire' },
    formulaire: livre ? { statut: 'valide', valideLe: g.date_envoi || null, reprise2026: true } : { statut: 'a_envoyer' },
    expeditions: livre || g.date_envoi ? [{
      adresseIdx: 0, transporteur: '', numero: '', nbColis: null,
      dateEnvoi: g.date_envoi || '', dateLivraison: g.date_livraison || '', statut: livre ? 'livre' : 'expedie',
    }] : [],
  };
}
Object.values(gies)
  .sort((a, b) => rangMois(a.souhaitTexte) - rangMois(b.souhaitTexte) || a.code.localeCompare(b.code))
  .forEach((g, i) => { g.priorite = i + 1; });

// ---------- Lignes ----------
let lignes = raw.client.map((r, k) => {
  const src = nettoyerSource({
    gie: r.gie_code, gieNom: r.gie_nom, codeAgence: r['Code Agence'], agence: r['Nom Agence'],
    civilite: r.titre_conseiller, nom: r['Nom associé/Collaborateur'],
    ca: typeof r.CA_totalHT === 'number' ? r.CA_totalHT : null, uv: r.nb_uv,
    categorie: r.categorie, recompense: r['récompense'],
  }, k + 2);
  const { _ligne, ...s } = src;
  return { id: nouvelId(), src: s, ovr: {}, conflits: [], statut: 'active', origine: 'client', ligneSource: _ligne, creeLe: MAINTENANT, majLe: MAINTENANT, produit: null };
});

// État corrigé à la main en 2026 (onglet Répartition) → corrections manuelles
const rep = raw.repartition.map((r, k) => ({
  ...nettoyerSource({ gie: r.gie, gieNom: r.gie_nom, codeAgence: '', agence: r.agence, civilite: r.civilite, nom: r.nom, categorie: r.categorie, recompense: r.recompense }, k + 2),
  _couleur: r.couleur,
}));
// Le rapprochement se fait sans code agence (absent de la Répartition)
const sansCode = lignes.map(l => ({ ...l, src: { ...l.src, codeAgence: '' } }));
const diff = comparer(sansCode, rep);
const journal = [{ date: MAINTENANT, auteur: 'Reprise 2026', type: 'import', ligneId: null, gie: '', nom: '', changements: [{ champ: 'import', avant: '', apres: `${lignes.length} lignes importées depuis « Réussites SMARTCLIC_FINAL 1 »` }], trophee: false }];
const parId = new Map(lignes.map(l => [l.id, l]));
const couleurAdresse = { '048': { FFC9DAF8: 0 }, '101': { FFFFFF00: 0 } };
const affecterAdresse = (l, row) => {
  const g = l.src?.gie || l.ovr?.gie;
  if (!couleurAdresse[g]) return;
  l.adresseIdx = couleurAdresse[g][row._couleur] ?? 1;
};
for (const m of diff.modifications) {
  const l = parId.get(m.id);
  const a = m.apres;
  const changements = [];
  if (a.nom !== l.src.nom) { l.ovr.nom = a.nom; changements.push({ champ: 'nom', avant: l.src.nom, apres: a.nom }); }
  if (normCiv(a.civilite) !== normCiv(l.src.civilite)) { l.ovr.civilite = a.civilite; changements.push({ champ: 'civilite', avant: l.src.civilite, apres: a.civilite }); }
  if (catCle(a.categorie).cle !== catCle(l.src.categorie).cle) { l.ovr.categorie = a.categorie; changements.push({ champ: 'categorie', avant: l.src.categorie, apres: a.categorie }); }
  if (normMetal(a.recompense) !== normMetal(l.src.recompense)) { l.ovr.recompense = a.recompense; changements.push({ champ: 'recompense', avant: l.src.recompense, apres: a.recompense }); }
  affecterAdresse(l, a);
  if (changements.length) journal.push({ date: MAINTENANT, auteur: 'Reprise 2026', type: 'correction', ligneId: l.id, gie: l.src.gie, nom: a.nom || agenceAffichee(a.agence), changements, trophee: changements.some(c => c.champ !== 'nom') });
}
// Lignes exactes : retrouver la couleur pour les GIE à 2 adresses
{
  const restants = new Set(diff.modifications.map(m => m.id));
  const exacts = lignes.filter(l => !restants.has(l.id) && !diff.suppressions.includes(l.id));
  const pool = rep.filter(r => couleurAdresse[r.gie]);
  for (const l of exacts) {
    if (!couleurAdresse[l.src.gie]) continue;
    const i = pool.findIndex(r => r.gie === l.src.gie && normNom(r.nom) === normNom(l.src.nom) && normMetal(r.recompense) === normMetal(l.src.recompense) && catCle(r.categorie).cle === catCle(l.src.categorie).cle);
    if (i >= 0) { affecterAdresse(l, pool[i]); pool.splice(i, 1); }
  }
}
for (const id of diff.suppressions) {
  const l = parId.get(id);
  l.ovr.supprime = true;
  journal.push({ date: MAINTENANT, auteur: 'Reprise 2026', type: 'suppression_manuelle', ligneId: id, gie: l.src.gie, nom: l.src.nom || agenceAffichee(l.src.agence), changements: [{ champ: 'supprime', avant: `${l.src.recompense} – ${l.src.categorie}`, apres: 'Supprimée (demande par mail)' }], trophee: true });
}
for (const a of diff.ajouts) {
  const { _ligne, _couleur, gieBrut, ...f } = a;
  const l = { id: nouvelId(), src: null, ovr: { ...f }, conflits: [], statut: 'active', origine: 'manuel', creeLe: MAINTENANT, majLe: MAINTENANT, produit: null };
  affecterAdresse(l, a);
  lignes.push(l);
  journal.push({ date: MAINTENANT, auteur: 'Reprise 2026', type: 'ajout_manuel', ligneId: l.id, gie: f.gie, nom: f.nom || agenceAffichee(f.agence), changements: [{ champ: 'recompense', avant: '', apres: `${f.recompense} – ${f.categorie}` }], trophee: true });
}

// ---------- Productions 2026 (2 vagues) ----------
const v1 = new Set(raw.vague1);
const lots = [
  { id: 'P001', numero: 1, type: 'initial', libelle: 'Vague 1 – livraison mi-mars', creeLe: '2026-02-20', envoyeLe: '2026-02-20', statut: 'recu', gies: [], qte: {}, usine: { commentaire: '', dateExpedition: '2026-03-12' } },
  { id: 'P002', numero: 2, type: 'initial', libelle: 'Vague 2 – livraison avril', creeLe: '2026-03-20', envoyeLe: '2026-03-20', statut: 'recu', gies: [], qte: {}, usine: { commentaire: '', dateExpedition: '2026-04-10' } },
];
for (const l of lignes) {
  if (!estActive(l)) continue;
  const { refId } = resoudreRef(l, idx);
  if (!refId) continue;
  const gie = effectif(l).gie;
  const lot = v1.has(gie) ? lots[0] : lots[1];
  l.produit = { lotId: lot.id, refId };
  lot.qte[refId] ??= {};
  lot.qte[refId][gie] = (lot.qte[refId][gie] || 0) + 1;
  if (!lot.gies.includes(gie)) lot.gies.push(gie);
}
lots.forEach(l => l.gies.sort());

const seed = {
  edition: '2026',
  parametres: {
    edition: '2026',
    ordreMetaux: ['Bronze', 'Argent', 'Or', 'Platine'],
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1OCOyLNPjlPmBOTvhcZuzaEjXC0R2RaYrAd1ij2xFtbc/edit',
    sheetOnglet: 'CATEGORIES CONFONDUES',
    derniereSynchro: null,
    expediteurNom: 'Julia – Smartshop',
    mailObjet: 'Réussites Orpi {edition} – vos informations de livraison ({gie})',
    mailCorps: "Bonjour {prenom},\n\nLes trophées Réussites {edition} de votre région ({gie}) sont en préparation : {nb} trophées au total.\n\nPouvez-vous nous indiquer la date de livraison souhaitée, l'adresse de livraison et le contact sur place via ce formulaire :\n{lien}\n\nMerci d'avance,\n{expediteur}",
    relanceObjet: 'Relance – Réussites Orpi {edition} : vos informations de livraison ({gie})',
    relanceCorps: "Bonjour {prenom},\n\nSauf erreur de notre part, nous n'avons pas encore reçu vos informations de livraison pour les trophées Réussites {edition} ({nb} trophées).\n\nVoici le lien du formulaire :\n{lien}\n\nMerci d'avance,\n{expediteur}",
    acces: [],
  },
  references, gies, lignes, lots, journal,
};
fs.mkdirSync(new URL('.', `file://${process.cwd()}/${sortie}`).pathname, { recursive: true });
fs.writeFileSync(sortie, JSON.stringify(seed));
const actives = lignes.filter(estActive);
console.log({
  lignes: lignes.length, actives: actives.length, corrections: journal.filter(j => j.type === 'correction').length,
  suppressionsManuelles: diff.suppressions.length, ajoutsManuels: diff.ajouts.length,
  modifsRapprochees: diff.modifications.length,
  lot1: Object.values(lots[0].qte).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b, 0), 0),
  lot2: Object.values(lots[1].qte).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b, 0), 0),
  sansRef: actives.filter(l => !resoudreRef(l, idx).refId).length,
});
