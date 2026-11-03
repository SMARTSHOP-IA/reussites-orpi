// Exports Excel : usine (lot / récapitulatif), répartition complète, journal, diplômes.
import { ecrireXlsx } from './xlsx.js';
import { telecharger, dateFr } from './ui.js';
import { calculer, STATUTS_LOT, STATUTS_FORM, STATUTS_EXPE, ETATS_PROD } from './model.js';
import { quantitesLot } from './actions.js';
import { METAUX, LIBELLES_CHAMPS, agenceAffichee } from './logic.js';

const somme = o => Object.values(o || {}).reduce((a, b) => a + b, 0);

function infosRef(etat, M, lot, refId) {
  const r = etat.references[refId];
  const s = lot?.refs?.[refId];
  return { num: s?.num ?? M.num[refId] ?? '', metal: r?.metal ?? s?.metal ?? '', libelle: r?.libelle ?? s?.libelle ?? refId };
}

// Fichier envoyé à Laser Style pour un lot.
export async function exporterLot(etat, lotId) {
  const M = calculer(etat);
  const lot = etat.lots[lotId];
  const qte = quantitesLot(lotId);
  const refsLot = Object.keys(qte).map(r => ({ id: r, ...infosRef(etat, M, lot, r) }))
    .sort((a, b) => (M.ordreMetaux.indexOf(a.metal) - M.ordreMetaux.indexOf(b.metal)) || (a.num - b.num));
  // Feuille 1 : quantités par référence
  const f1 = [[`Réussites Orpi ${etat.parametres.edition} – Lot n°${lot.numero} – ${lot.libelle}`], [`Statut : ${STATUTS_LOT[lot.statut]}${lot.envoyeLe ? ` – envoyé le ${dateFr(lot.envoyeLe)}` : ''} – ${lot.gies.length} GIE`], [], ['N°', 'Métal', 'Trophée', 'Quantité']];
  for (const m of M.ordreMetaux) {
    const rs = refsLot.filter(r => r.metal === m);
    if (!rs.length) continue;
    for (const r of rs) f1.push([r.num, r.metal, r.libelle, somme(qte[r.id])]);
    f1.push([{ v: '', style: 2 }, { v: `Total ${m}`, style: 2 }, '', { v: rs.reduce((s, r) => s + somme(qte[r.id]), 0), style: 2 }]);
  }
  f1.push([], ['', { v: 'TOTAL LOT', style: 2 }, '', { v: refsLot.reduce((s, r) => s + somme(qte[r.id]), 0), style: 2 }]);
  // Feuille 2 : détail par GIE (format habituel : une ligne par trophée, métaux en colonnes)
  const f2 = [['GIE', 'Trophée', ...METAUX, 'Total']];
  for (const g of lot.gies) {
    const parLib = new Map();
    for (const r of refsLot) {
      const n = qte[r.id]?.[g];
      if (!n) continue;
      if (!parLib.has(r.libelle)) parLib.set(r.libelle, {});
      parLib.get(r.libelle)[r.metal] = (parLib.get(r.libelle)[r.metal] || 0) + n;
    }
    const nomG = etat.gies[g]?.nom || '';
    let first = true;
    const tot = Object.fromEntries(METAUX.map(m => [m, 0]));
    for (const [lib, ms] of [...parLib.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      f2.push([first ? `${g} – ${nomG}` : '', lib, ...METAUX.map(m => ms[m] || ''), somme(ms)]);
      METAUX.forEach(m => { tot[m] += ms[m] || 0; });
      first = false;
    }
    f2.push([{ v: `Total ${g}`, style: 2 }, '', ...METAUX.map(m => ({ v: tot[m] || '', style: 2 })), { v: somme(tot), style: 2 }], []);
  }
  // Feuille 3 : récapitulatif par GIE
  const f3 = [['GIE', ...METAUX, 'Total']];
  for (const g of lot.gies) {
    const t = Object.fromEntries(METAUX.map(m => [m, 0]));
    for (const r of refsLot) t[r.metal] += qte[r.id]?.[g] || 0;
    f3.push([`${g} – ${etat.gies[g]?.nom || ''}`, ...METAUX.map(m => t[m]), somme(t)]);
  }
  const blob = await ecrireXlsx([
    { nom: 'Quantités', lignes: f1, entetes: 0, largeurs: [6, 10, 40, 10] },
    { nom: 'Détail par GIE', lignes: f2, largeurs: [44, 40, 9, 9, 9, 9, 9] },
    { nom: 'Récap GIE', lignes: f3, largeurs: [44, 9, 9, 9, 9, 9] },
  ]);
  telecharger(`Reussites-Orpi-${etat.parametres.edition}-Lot-${lot.numero}.xlsx`, blob);
}

// Récapitulatif usine : toutes les références, quantités par lot, reste à produire.
export async function exporterRecapUsine(etat, avecReste = true) {
  const M = calculer(etat);
  const lots = Object.values(etat.lots).filter(l => l.statut !== 'brouillon').sort((a, b) => a.numero - b.numero);
  const ent = ['N°', 'Métal', 'Trophée', ...(avecReste ? ['Total édition'] : []), ...lots.map(l => `Lot ${l.numero}`), ...(avecReste ? ['Reste à produire'] : [])];
  const L = [ent];
  for (const m of M.ordreMetaux) {
    const rs = M.refsTri.filter(r => r.metal === m);
    const tot = { edition: 0, lots: lots.map(() => 0) };
    for (const r of rs) {
      const parLot = lots.map(l => somme(l.qte?.[r.id]));
      const edition = M.qteParRef[r.id] || 0;
      const produitsActifs = M.lignes.filter(x => x.active && x.refId === r.id && (x.prod === 'produit')).length;
      L.push([M.num[r.id], m, r.libelle, ...(avecReste ? [edition] : []), ...parLot, ...(avecReste ? [edition - produitsActifs] : [])]);
      tot.edition += edition; parLot.forEach((v, i) => { tot.lots[i] += v; });
    }
    L.push(['', { v: `Total ${m}`, style: 2 }, '', ...(avecReste ? [{ v: tot.edition, style: 2 }] : []), ...tot.lots.map(v => ({ v, style: 2 })), ...(avecReste ? [''] : [])]);
  }
  const blob = await ecrireXlsx([{ nom: 'Récapitulatif', lignes: L, largeurs: [6, 10, 40, 12, ...lots.map(() => 9), 14] }]);
  telecharger(`Reussites-Orpi-${etat.parametres.edition}-Recap-usine.xlsx`, blob);
}

// Sauvegarde complète : répartition, GIE, références, journal.
export async function exporterTout(etat) {
  const M = calculer(etat);
  const pbLib = x => x.pb.join(', ');
  const rep = [['GIE', 'Nom GIE', 'Code agence', 'Agence', 'Civilité', 'Nom', 'Catégorie (client)', 'Métal', 'N° réf', 'Trophée', 'Adresse', 'Production', 'Corrigé à la main', 'Incohérences', 'Origine']];
  const lignes = M.lignes.filter(x => x.active).sort((a, b) => a.gie.localeCompare(b.gie) || (a.num || 99) - (b.num || 99));
  for (const x of lignes) {
    const style = x.niveau === 'erreur' ? 3 : x.niveau === 'alerte' ? 4 : 0;
    const g = etat.gies[x.gie];
    const cell = v => ({ v: v ?? '', style });
    rep.push([cell(x.gie), cell(x.e.gieNom), cell(x.e.codeAgence), cell(x.agence), cell(x.e.civilite), cell(x.e.nom), cell(x.e.categorie), cell(x.metal), cell(x.num), cell(etat.references[x.refId]?.libelle), cell(g?.adresses?.[x.l.adresseIdx]?.libelle || ''), cell(ETATS_PROD[x.prod]?.libelle), cell(Object.keys(x.l.ovr || {}).filter(k => k !== 'supprime').map(k => LIBELLES_CHAMPS[k] || k).join(', ')), cell(pbLib(x)), cell(x.l.origine === 'manuel' ? 'Ajout manuel' : 'Fichier client')]);
  }
  const gies = [['Priorité', 'GIE', 'Nom', 'Platine', 'Or', 'Argent', 'Bronze', 'Total', 'Contact', 'Téléphone', 'E-mail', 'Adresse(s)', 'Date souhaitée', 'Formulaire', 'BAT diplômes', 'Expédition', 'Commentaires']];
  for (const g of M.giesTries) {
    const G = g.gie;
    gies.push([G.priorite, g.code, G.nom, g.metaux.Platine, g.metaux.Or, g.metaux.Argent, g.metaux.Bronze, g.total, `${G.contact?.prenom || ''} ${G.contact?.nom || ''}`.trim(), G.contact?.tel || '', G.contact?.email || '', (G.adresses || []).map(a => `${a.libelle} : ${a.texte}`).join('\n\n'), G.dateSouhaitee || G.souhaitTexte || '', STATUTS_FORM[G.formulaire?.statut] || '', G.diplomes?.bat || '', STATUTS_EXPE[g.expedition] || '', G.commentaires || '']);
  }
  const refs = [['N°', 'Métal', 'Trophée', 'Catégories du fichier client', 'Quantité']];
  for (const r of M.refsTri) refs.push([M.num[r.id], r.metal, r.libelle, (r.regles || []).map(x => `${x.cat} (${x.civ === 'M' ? 'Monsieur' : x.civ === 'F' ? 'Madame' : 'tous'})`).join(' ; '), M.qteParRef[r.id] || 0]);
  const blob = await ecrireXlsx([
    { nom: 'Répartition', lignes: rep, largeurs: [6, 30, 10, 30, 10, 28, 28, 9, 7, 30, 18, 22, 16, 30, 14] },
    { nom: 'GIE', lignes: gies, largeurs: [8, 6, 34, 8, 8, 8, 8, 8, 22, 14, 26, 40, 14, 14, 12, 12, 40] },
    { nom: 'Références', lignes: refs, largeurs: [6, 10, 34, 60, 10] },
    journalFeuille(etat),
  ]);
  telecharger(`Reussites-Orpi-${etat.parametres.edition}-Sauvegarde-${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
}

export const TYPES_JOURNAL = {
  import: 'Import', ajout: 'Ajout (client)', modification: 'Modification (client)', suppression: 'Suppression (client)',
  correction: 'Correction manuelle', ajout_manuel: 'Ajout manuel', suppression_manuelle: 'Suppression manuelle', retablissement: 'Rétablissement',
  formulaire: 'Formulaire', production: 'Production', expedition: 'Expédition', gie: 'GIE',
};

function journalFeuille(etat, filtre = () => true) {
  const L = [['Date', 'Auteur', 'Type', 'GIE', 'Lauréat / agence', 'Champ', 'Avant', 'Après', 'Trophée à refaire']];
  for (const j of [...etat.journal].filter(filtre).sort((a, b) => b.date.localeCompare(a.date))) {
    for (const c of j.changements || [{}]) {
      L.push([dateFr(j.date, true), j.auteur, TYPES_JOURNAL[j.type] || j.type, j.gie, j.nom, LIBELLES_CHAMPS[c.champ] || c.champ || '', String(c.avant ?? ''), String(c.apres ?? ''), j.dejaProduit ? 'Oui (déjà produit)' : '']);
    }
  }
  return { nom: 'Journal', lignes: L, largeurs: [16, 20, 22, 8, 30, 16, 30, 30, 16] };
}

export async function exporterJournal(etat, filtre) {
  telecharger(`Reussites-Orpi-${etat.parametres.edition}-Journal.xlsx`, await ecrireXlsx([journalFeuille(etat, filtre)]));
}

export async function exporterDiplomes(etat, codes) {
  const M = calculer(etat);
  const L = [['GIE', 'Nom GIE', 'Agence', 'Civilité', 'Nom', 'Trophée', 'Métal', 'N° réf']];
  for (const x of M.lignes.filter(y => y.active && (!codes || codes.includes(y.gie))).sort((a, b) => a.gie.localeCompare(b.gie) || a.agence.localeCompare(b.agence))) {
    L.push([x.gie, etat.gies[x.gie]?.nom || '', x.agence, x.e.civilite, x.e.nom || agenceAffichee(x.e.agence), etat.references[x.refId]?.libelle || x.e.categorie, x.metal, x.num || '']);
  }
  telecharger(`Reussites-Orpi-${etat.parametres.edition}-Diplomes.xlsx`, await ecrireXlsx([{ nom: 'Diplômes', lignes: L, largeurs: [6, 34, 30, 10, 30, 32, 9, 7] }]));
}
