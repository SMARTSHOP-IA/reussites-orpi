import { h, dateFr, selectHtml } from '../ui.js';
import { agir, pastille } from './commun.js';
import { STATUTS_BAT } from '../model.js';
import { majGie } from '../actions.js';
import { exporterDiplomes } from '../exports.js';

// Module diplômes : suivi des BAT par GIE et liste des diplômes à refaire.
// Le générateur de diplômes sera étudié dans un second temps.
export function vueDiplomes(root, ctx) {
  const { etat, M, lecture } = ctx;
  const gies = M.giesTries.filter(g => g.total);
  // Noms modifiés après validation du BAT
  const aRefaire = [];
  for (const g of gies) {
    const depuis = g.gie.diplomes?.batLe;
    if (!depuis || !['valide', 'imprime'].includes(g.gie.diplomes?.bat)) continue;
    for (const j of etat.journal) {
      if (j.gie !== g.code || j.date < depuis) continue;
      const ch = (j.changements || []).filter(c => ['nom', 'civilite', 'categorie', 'recompense', 'supprime'].includes(c.champ));
      if (ch.length || j.type === 'ajout' || j.type === 'ajout_manuel') aRefaire.push({ g, j });
    }
  }
  const classe = s => ({ a_faire: 'gris', envoye: 'bleu-clair', valide: 'bleu', imprime: 'vert' }[s] || 'gris');
  root.innerHTML = `
    <header class="entete"><div><h1>Diplômes</h1><p class="sous-titre">Suivi des BAT par région. Le générateur de diplômes viendra se brancher ici (à étudier dans un second temps).</p></div>
      <button class="btn" id="export">Exporter la liste des diplômes</button></header>
    ${aRefaire.length ? `<section class="carte"><h2>Diplômes à revoir <small>(changements après validation du BAT)</small></h2><table class="table dense"><thead><tr><th>GIE</th><th>Date</th><th>Lauréat</th><th>Changement</th></tr></thead><tbody>
      ${aRefaire.map(({ g, j }) => `<tr><td>${g.code}</td><td>${dateFr(j.date, true)}</td><td>${h(j.nom)}</td><td>${(j.changements || []).map(c => `${c.avant ? `<s>${h(c.avant)}</s> → ` : ''}${h(c.apres)}`).join(' · ')}</td></tr>`).join('')}
    </tbody></table></section>` : ''}
    <section class="carte"><h2>BAT par région</h2><div class="table-defile"><table class="table">
      <thead><tr><th>Prio.</th><th>GIE</th><th class="num">Diplômes</th><th>Statut BAT</th><th>Depuis</th><th></th></tr></thead>
      <tbody>${gies.map(g => `<tr data-gie="${g.code}"><td class="num">${g.gie.priorite}</td><td><strong>${g.code}</strong> ${h(g.gie.nom)}</td><td class="num">${g.total}</td>
        <td>${lecture ? pastille(STATUTS_BAT[g.gie.diplomes?.bat || 'a_faire'], classe(g.gie.diplomes?.bat)) : selectHtml('bat', Object.entries(STATUTS_BAT), g.gie.diplomes?.bat || 'a_faire')}</td>
        <td>${dateFr(g.gie.diplomes?.batLe)}</td><td><button class="btn petit lien" data-xls="${g.code}">Liste Excel</button></td></tr>`).join('')}</tbody>
    </table></div></section>`;
  root.querySelector('#export').onclick = () => agir(() => exporterDiplomes(etat));
  root.querySelectorAll('[data-xls]').forEach(b => { b.onclick = () => agir(() => exporterDiplomes(etat, [b.dataset.xls])); });
  root.querySelectorAll('select[name=bat]').forEach(s => {
    s.onchange = () => {
      const code = s.closest('tr').dataset.gie;
      const G = etat.gies[code];
      agir(() => majGie(code, { diplomes: { ...(G.diplomes || {}), bat: s.value, batLe: new Date().toISOString() } }, `BAT diplômes : ${STATUTS_BAT[s.value]}`));
    };
  });
}
