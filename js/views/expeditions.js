import { h, dateFr, selectHtml, aujourdhui } from '../ui.js';
import { agir, pastille, badgeExpe } from './commun.js';
import { majExpedition } from '../actions.js';
import { TRANSPORTEURS, lienSuivi } from '../logic.js';
import { STATUTS_EXPE } from '../model.js';

const F = { statut: '' };

export function vueExpeditions(root, ctx) {
  const { M, lecture } = ctx;
  const lignes = [];
  for (const g of M.giesTries) {
    if (!g.total) continue;
    const adr = g.gie.adresses?.length ? g.gie.adresses : [{ libelle: 'Adresse de livraison', texte: '' }];
    adr.forEach((a, i) => {
      const nb = adr.length > 1 ? g.lignes.filter(x => x.l.adresseIdx === i).length : g.total;
      const ex = g.gie.expeditions?.[i] || { statut: 'a_preparer' };
      lignes.push({ g, a, i, nb, ex, nbAdr: adr.length });
    });
  }
  const pret = g => g.prod.a_produire + g.prod.complement + g.prod.brouillon + g.prod.bloque === 0 && g.lots?.length && g.lots.every(l => l.statut === 'recu');
  const vis = lignes.filter(r => !F.statut || (r.ex.statut || 'a_preparer') === F.statut);
  const dis = lecture ? 'disabled' : '';

  root.innerHTML = `
    <header class="entete"><div><h1>Expéditions</h1><p class="sous-titre">Suivi des colis envoyés par Smartshop aux régions (une ligne par adresse de livraison).</p></div></header>
    <div class="filtres">${selectHtml('statut', [['', 'Tous les envois'], ...Object.entries(STATUTS_EXPE)], F.statut, 'id="f-statut"')}</div>
    <div class="table-defile"><table class="table dense expe">
      <thead><tr><th>Prio.</th><th>GIE / adresse</th><th class="num">Trophées</th><th>Trophées reçus de l'usine</th><th>Transporteur</th><th>N° de suivi</th><th class="num">Colis</th><th>Envoi</th><th>Livraison</th><th>Statut</th></tr></thead>
      <tbody>${vis.map(r => `<tr data-gie="${r.g.code}" data-i="${r.i}">
        <td class="num">${r.g.gie.priorite}</td>
        <td><strong>${r.g.code}</strong> ${h(r.g.gie.nom)}<br><small><b>${h(r.a.libelle)}</b> ${h((r.a.texte || '— adresse à compléter').split('\n').join(', '))}</small>${r.g.gie.dateSouhaitee ? `<br><small>Souhaitée le ${dateFr(r.g.gie.dateSouhaitee)}</small>` : ''}</td>
        <td class="num">${r.nb}</td>
        <td>${pret(r.g) ? pastille('Prêt à expédier', 'vert') : pastille(r.g.lots?.length ? 'En attente usine' : 'Pas encore lancé', 'gris')}</td>
        <td>${selectHtml('transporteur', [['', '—'], ...Object.keys(TRANSPORTEURS).map(t => [t, t])], r.ex.transporteur, dis)}</td>
        <td><input name="numero" value="${h(r.ex.numero || '')}" ${dis} size="14">${lienSuivi(r.ex.transporteur, r.ex.numero) ? ` <a href="${lienSuivi(r.ex.transporteur, r.ex.numero)}" target="_blank" title="Suivre le colis">↗</a>` : ''}</td>
        <td><input name="nbColis" type="number" min="0" value="${h(r.ex.nbColis ?? '')}" ${dis} class="court"></td>
        <td><input name="dateEnvoi" type="date" value="${h(r.ex.dateEnvoi || '')}" ${dis}></td>
        <td><input name="dateLivraison" type="date" value="${h(r.ex.dateLivraison || '')}" ${dis}></td>
        <td>${lecture ? badgeExpe(r.ex.statut) : selectHtml('statut', Object.entries(STATUTS_EXPE), r.ex.statut || 'a_preparer')}</td>
      </tr>`).join('') || '<tr><td colspan="10" class="vide">Aucun envoi.</td></tr>'}</tbody>
    </table></div>`;

  root.querySelector('#f-statut').onchange = e => { F.statut = e.target.value; vueExpeditions(root, ctx); };
  if (lecture) return;
  root.querySelectorAll('tr[data-gie] input, tr[data-gie] select').forEach(el => {
    el.onchange = () => {
      const tr = el.closest('tr');
      const modifs = { [el.name]: el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value };
      if (el.name === 'statut' && el.value === 'expedie' && !tr.querySelector('[name=dateEnvoi]').value) modifs.dateEnvoi = aujourdhui();
      if (el.name === 'statut' && el.value === 'livre' && !tr.querySelector('[name=dateLivraison]').value) modifs.dateLivraison = aujourdhui();
      if (el.name === 'numero' && el.value && tr.querySelector('[name=statut]').value === 'a_preparer') modifs.statut = 'expedie';
      if (modifs.statut === 'expedie' && !tr.querySelector('[name=dateEnvoi]').value) modifs.dateEnvoi = aujourdhui();
      modifs.adresseIdx = Number(tr.dataset.i);
      agir(() => majExpedition(tr.dataset.gie, Number(tr.dataset.i), modifs));
    };
  });
}
