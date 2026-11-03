import { h, dateFr, nombre, panneau, fermerPanneau, selectHtml, confirmer, toast, aujourdhui, metalChip } from '../ui.js';
import { agir, compteMetaux, badgeForm, pastille } from './commun.js';
import { STATUTS_LOT } from '../model.js';
import { creerLot, envoyerLot, majLot, supprimerLot, quantitesLot } from '../actions.js';
import { exporterLot, exporterRecapUsine } from '../exports.js';
import { METAUX } from '../logic.js';

const somme = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
const total = q => Object.values(q || {}).reduce((s, o) => s + somme(o), 0);
const TYPES = { initial: 'Initial', complement: 'Complément (facturable)', mixte: 'Initial + compléments' };
const classeStatut = s => ({ brouillon: 'gris', envoye: 'bleu', fabrication: 'orange', expedie: 'violet', recu: 'vert' }[s]);

export function vueProductions(root, ctx) {
  const { etat, M, user } = ctx;
  const usine = user.role === 'usine';
  const lots = Object.values(etat.lots).filter(l => !usine || l.statut !== 'brouillon').sort((a, b) => b.numero - a.numero);
  const prets = usine ? [] : M.giesTries.filter(g => g.prod.a_produire + g.prod.complement > 0);
  const bloques = usine ? [] : M.lignes.filter(x => x.active && x.prod === 'bloque');

  root.innerHTML = `
    <header class="entete"><div><h1>${usine ? 'Productions Réussites Orpi' : 'Productions usine'}</h1>
      <p class="sous-titre">${usine ? 'Lots de trophées à produire et à livrer chez Smartshop. Chaque GIE d\'un lot doit être livré en une seule fois.' : 'Un GIE est toujours produit en entier dans un même lot, pour être livré en une fois.'}</p></div>
      <div class="pile-h"><button class="btn" id="recap">Récapitulatif Excel</button></div></header>
    ${usine ? '' : `
    <section class="carte">
      <h2>À lancer en production <small>(ordre de priorité)</small></h2>
      ${bloques.length ? `<div class="encart rouge">${bloques.length} trophée(s) sans référence ne pourront pas être produits tant que l'incohérence n'est pas corrigée. <a href="#/recompenses?f=erreur">Corriger</a></div>` : ''}
      ${prets.length ? `
      <div class="table-defile"><table class="table">
        <thead><tr><th><input type="checkbox" id="tout"></th><th>Prio.</th><th>GIE</th><th class="num">Nouveaux</th><th class="num">Compléments</th><th>Détail</th><th>Livraison souhaitée</th><th>Formulaire</th></tr></thead>
        <tbody>${prets.map(g => {
          const m = { Platine: 0, Or: 0, Argent: 0, Bronze: 0 };
          g.lignes.filter(x => x.prod === 'a_produire' || x.prod === 'complement').forEach(x => { m[x.metal]++; });
          return `<tr><td><input type="checkbox" data-sel="${g.code}"></td><td class="num">${g.gie.priorite}</td><td><strong>${g.code}</strong> ${h(g.gie.nom)}</td>
          <td class="num">${g.prod.a_produire || ''}</td><td class="num">${g.prod.complement ? pastille(g.prod.complement, 'orange') : ''}</td><td>${compteMetaux(m)}</td>
          <td>${h(g.gie.dateSouhaitee ? dateFr(g.gie.dateSouhaitee) : g.gie.souhaitTexte || '')}</td><td>${badgeForm(g.gie.formulaire?.statut)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="barre-actions"><input id="libelle-lot" placeholder="Nom du lot (ex. Vague 1 – livraison mi-mars)"><button class="btn principal" id="creer">Créer un lot avec les GIE cochés</button></div>` : '<p class="vide">Tous les trophées actifs sont déjà dans un lot.</p>'}
    </section>`}
    <section class="carte">
      <h2>Lots</h2>
      ${lots.length ? `<div class="table-defile"><table class="table">
        <thead><tr><th>N°</th><th>Lot</th><th>Type</th><th class="num">GIE</th><th class="num">Trophées</th><th>Statut</th><th>Envoyé le</th><th>Expédition usine</th><th></th></tr></thead>
        <tbody>${lots.map(l => {
          const q = quantitesLot(l.id);
          return `<tr class="cliquable" data-lot="${l.id}"><td class="num"><strong>${l.numero}</strong></td><td>${h(l.libelle)}${l.usine?.commentaire ? `<br><small>Usine : ${h(l.usine.commentaire)}</small>` : ''}</td>
            <td>${l.type === 'initial' ? 'Initial' : pastille(TYPES[l.type] || l.type, 'orange')}</td><td class="num">${(l.gies || []).length}</td><td class="num"><strong>${nombre(total(q))}</strong></td>
            <td>${pastille(STATUTS_LOT[l.statut], classeStatut(l.statut))}</td><td>${dateFr(l.envoyeLe)}</td><td>${dateFr(l.usine?.dateExpedition)}</td>
            <td class="actions"><button class="btn petit" data-xls="${l.id}">Excel</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="vide">Aucun lot pour le moment.</p>'}
    </section>
    ${usine ? '' : recapHtml(etat, M)}`;

  root.querySelector('#recap').onclick = () => agir(() => exporterRecapUsine(etat, !usine));
  root.querySelector('#tout')?.addEventListener('change', e => root.querySelectorAll('[data-sel]').forEach(c => { c.checked = e.target.checked; }));
  root.querySelector('#creer')?.addEventListener('click', () => {
    const codes = [...root.querySelectorAll('[data-sel]:checked')].map(c => c.dataset.sel);
    if (!codes.length) return toast('Coche les GIE à mettre dans le lot', 'info');
    agir(async () => { const id = await creerLot(codes, root.querySelector('#libelle-lot').value.trim()); ouvrirLot(ctx, id); }, 'Lot créé (en préparation) : vérifie les quantités puis envoie-le à l\'usine');
  });
  root.querySelectorAll('[data-xls]').forEach(b => { b.onclick = e => { e.stopPropagation(); agir(() => exporterLot(etat, b.dataset.xls)); }; });
  root.querySelectorAll('tr[data-lot]').forEach(tr => { tr.onclick = () => ouvrirLot(ctx, tr.dataset.lot); });
}

function recapHtml(etat, M) {
  const lots = Object.values(etat.lots).filter(l => l.statut !== 'brouillon').sort((a, b) => a.numero - b.numero);
  const produitParRef = {};
  for (const x of M.lignes) if (x.active && x.prod === 'produit') produitParRef[x.refId] = (produitParRef[x.refId] || 0) + 1;
  return `<section class="carte"><h2>Récapitulatif par référence</h2><div class="table-defile"><table class="table dense">
    <thead><tr><th>N°</th><th>Métal</th><th>Trophée</th><th class="num">Total édition</th>${lots.map(l => `<th class="num">Lot ${l.numero}</th>`).join('')}<th class="num">Reste à produire</th></tr></thead>
    <tbody>${M.ordreMetaux.map(m => {
      const rs = M.refsTri.filter(r => r.metal === m);
      const lignes = rs.map(r => {
        const reste = (M.qteParRef[r.id] || 0) - (produitParRef[r.id] || 0);
        return `<tr><td class="num">${M.num[r.id]}</td><td>${metalChip(m)}</td><td>${h(r.libelle)}</td><td class="num">${M.qteParRef[r.id] || ''}</td>${lots.map(l => `<td class="num">${somme(l.qte?.[r.id]) || ''}</td>`).join('')}<td class="num">${reste ? `<strong>${reste}</strong>` : ''}</td></tr>`;
      }).join('');
      const tot = rs.reduce((s, r) => s + (M.qteParRef[r.id] || 0), 0);
      return `${lignes}<tr class="total"><td></td><td colspan="2">Total ${m}</td><td class="num">${tot}</td>${lots.map(l => `<td class="num">${rs.reduce((s, r) => s + somme(l.qte?.[r.id]), 0)}</td>`).join('')}<td class="num">${rs.reduce((s, r) => s + (M.qteParRef[r.id] || 0) - (produitParRef[r.id] || 0), 0)}</td></tr>`;
    }).join('')}</tbody></table></div></section>`;
}

function ouvrirLot(ctx, id) {
  const { etat, M, user } = ctx;
  const lot = etat.lots[id];
  if (!lot) return;
  const usine = user.role === 'usine';
  const q = quantitesLot(id);
  const refs = Object.keys(q).map(r => ({ id: r, num: lot.refs?.[r]?.num ?? M.num[r], metal: etat.references[r]?.metal ?? lot.refs?.[r]?.metal, libelle: etat.references[r]?.libelle ?? lot.refs?.[r]?.libelle }))
    .sort((a, b) => (M.ordreMetaux.indexOf(a.metal) - M.ordreMetaux.indexOf(b.metal)) || (a.num - b.num));
  const gies = [...new Set(Object.values(q).flatMap(o => Object.keys(o)))].sort();
  const complements = usine ? [] : M.lignes.filter(x => x.l.produit?.lotId === id && x.l.produit.facturable);
  const contenu = `
    <p>${pastille(STATUTS_LOT[lot.statut], classeStatut(lot.statut))} ${lot.type !== 'initial' ? pastille(TYPES[lot.type], 'orange') : ''} · <strong>${nombre(total(q))} trophées</strong> · ${gies.length} GIE</p>
    ${lot.statut === 'brouillon' ? '<div class="encart bleu">Lot en préparation : il n\'est pas encore visible par l\'usine. Les quantités suivent les modifications en temps réel jusqu\'à l\'envoi.</div>' : ''}
    <div class="pile-h">
      <button class="btn" id="xls">Exporter en Excel</button>
      ${!usine && lot.statut === 'brouillon' ? '<button class="btn principal" id="envoyer">Envoyer à l\'usine</button><button class="btn danger" id="suppr">Supprimer le lot</button>' : ''}
      ${usine && lot.statut === 'envoye' ? '<button class="btn principal" id="fab">Marquer « en fabrication »</button>' : ''}
    </div>
    ${lot.statut !== 'brouillon' ? `<section class="bloc"><h3>Suivi usine</h3><form id="f-usine" class="grille-form">
      <label>Statut${selectHtml('statut', Object.entries(STATUTS_LOT).filter(([k]) => k !== 'brouillon' && (!usine || k !== 'recu')), lot.statut, usine && lot.statut === 'recu' ? 'disabled' : '')}</label>
      <label>Date d'expédition par l'usine<input type="date" name="dateExpedition" value="${h(lot.usine?.dateExpedition || '')}"></label>
      <label class="large">Commentaire de l'usine<textarea name="commentaire" rows="2">${h(lot.usine?.commentaire || '')}</textarea></label>
      <div class="large"><button class="btn principal" type="submit">Enregistrer</button></div>
    </form></section>` : ''}
    <section class="bloc"><h3>Quantités par référence</h3><table class="table dense"><thead><tr><th>N°</th><th>Métal</th><th>Trophée</th><th class="num">Qté</th></tr></thead><tbody>
      ${refs.map(r => `<tr><td class="num">${r.num}</td><td>${metalChip(r.metal)}</td><td>${h(r.libelle)}</td><td class="num"><strong>${somme(q[r.id])}</strong></td></tr>`).join('')}
    </tbody></table></section>
    <section class="bloc"><h3>Par GIE (à livrer ensemble)</h3><table class="table dense"><thead><tr><th>GIE</th>${METAUX.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${gies.map(g => { const t = Object.fromEntries(METAUX.map(m => [m, 0])); refs.forEach(r => { t[r.metal] += q[r.id]?.[g] || 0; }); return `<tr><td><strong>${g}</strong> ${h(etat.gies[g]?.nom || '')}</td>${METAUX.map(m => `<td class="num">${t[m] || ''}</td>`).join('')}<td class="num"><strong>${somme(t)}</strong></td></tr>`; }).join('')}
    </tbody></table></section>
    ${complements.length ? `<section class="bloc"><h3>Compléments facturables (${complements.length})</h3><table class="table dense"><thead><tr><th>GIE</th><th>Lauréat</th><th>Trophée</th></tr></thead><tbody>${complements.map(x => `<tr><td>${x.gie}</td><td>${h(x.e.nom || x.agence)}</td><td>${M.num[x.refId] || ''} ${h(etat.references[x.refId]?.libelle || '')} ${metalChip(x.metal)}</td></tr>`).join('')}</tbody></table></section>` : ''}`;

  panneau(`Lot ${lot.numero} – ${h(lot.libelle)}`, contenu, corps => {
    corps.querySelector('#xls').onclick = () => agir(() => exporterLot(etat, id));
    corps.querySelector('#envoyer')?.addEventListener('click', async () => {
      if (!(await confirmer(`Envoyer le lot ${lot.numero} (${total(q)} trophées) à l'usine ? Il deviendra visible pour Laser Style et les quantités seront figées.`, 'Envoyer à l\'usine'))) return;
      agir(async () => { await envoyerLot(id); fermerPanneau(); }, 'Lot envoyé à l\'usine');
    });
    corps.querySelector('#suppr')?.addEventListener('click', async () => {
      if (!(await confirmer('Supprimer ce lot en préparation ? Les trophées redeviendront « à produire ».', 'Supprimer'))) return;
      agir(async () => { await supprimerLot(id); fermerPanneau(); }, 'Lot supprimé');
    });
    corps.querySelector('#fab')?.addEventListener('click', () => agir(async () => { await majLot(id, { statut: 'fabrication' }); fermerPanneau(); }, 'Statut mis à jour'));
    const f = corps.querySelector('#f-usine');
    if (f) f.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f).entries());
      const statut = d.statut || lot.statut;
      const dateExpedition = d.dateExpedition || (statut === 'expedie' && !lot.usine?.dateExpedition ? aujourdhui() : lot.usine?.dateExpedition || '');
      agir(async () => {
        await majLot(id, { statut, usine: { ...(lot.usine || {}), dateExpedition, commentaire: d.commentaire }, ...(statut === 'recu' && lot.statut !== 'recu' ? { recuLe: new Date().toISOString() } : {}) }, statut !== lot.statut ? `Lot n°${lot.numero} : ${STATUTS_LOT[statut]}` : null);
        fermerPanneau();
      }, 'Suivi enregistré');
    };
  });
}
