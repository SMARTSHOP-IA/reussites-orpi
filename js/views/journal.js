import { h, dateFr, selectHtml, nombre } from '../ui.js';
import { agir, pastille, optionsGie } from './commun.js';
import { LIBELLES_CHAMPS, norm } from '../logic.js';
import { TYPES_JOURNAL, exporterJournal } from '../exports.js';

const F = { type: '', gie: '', texte: '', trophee: false, page: 0 };
const PAR_PAGE = 200;
const CLASSE = { ajout: 'vert', ajout_manuel: 'vert', modification: 'bleu', correction: 'bleu-clair', suppression: 'rouge', suppression_manuelle: 'rouge', retablissement: 'vert', import: 'gris', formulaire: 'violet', production: 'orange', expedition: 'orange', gie: 'gris' };

export function vueJournal(root, ctx) {
  const { etat, M } = ctx;
  const txt = norm(F.texte);
  const filtre = j => (!F.type || j.type === F.type || (F.type === 'client' && ['ajout', 'modification', 'suppression'].includes(j.type)) || (F.type === 'manuel' && ['correction', 'ajout_manuel', 'suppression_manuelle', 'retablissement'].includes(j.type)))
    && (!F.gie || String(j.gie || '').split(', ').includes(F.gie))
    && (!F.trophee || j.trophee)
    && (!txt || norm(`${j.nom} ${j.auteur} ${(j.changements || []).map(c => `${c.avant} ${c.apres}`).join(' ')}`).includes(txt));
  const liste = [...etat.journal].filter(filtre).sort((a, b) => b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  F.page = Math.min(F.page, pages - 1);
  const vis = liste.slice(F.page * PAR_PAGE, (F.page + 1) * PAR_PAGE);

  root.innerHTML = `
    <header class="entete"><div><h1>Journal des modifications</h1><p class="sous-titre">Toutes les lignes ajoutées, modifiées ou supprimées (par le fichier client ou à la main), et les actions de suivi. ${nombre(liste.length)} entrée(s).</p></div>
      <button class="btn" id="export">Exporter en Excel</button></header>
    <div class="filtres">
      <input type="search" id="f-texte" placeholder="Rechercher…" value="${h(F.texte)}">
      ${selectHtml('type', [['', 'Tous les types'], ['client', 'Changements du fichier client'], ['manuel', 'Changements manuels'], ...Object.entries(TYPES_JOURNAL)], F.type, 'id="f-type"')}
      ${selectHtml('gie', optionsGie(M), F.gie, 'id="f-gie"')}
      <label class="case"><input type="checkbox" id="f-trophee" ${F.trophee ? 'checked' : ''}> Seulement ce qui change un trophée</label>
    </div>
    <div class="table-defile"><table class="table dense">
      <thead><tr><th>Date</th><th>Type</th><th>GIE</th><th>Lauréat / agence</th><th>Détail</th><th>Par</th></tr></thead>
      <tbody>${vis.map(j => `<tr class="${j.ligneId ? 'cliquable' : ''}" data-ligne="${j.ligneId || ''}" data-gie="${h(j.gie || '')}">
        <td class="nowrap">${dateFr(j.date, true)}</td>
        <td>${pastille(TYPES_JOURNAL[j.type] || j.type, CLASSE[j.type] || 'gris')}${j.dejaProduit ? `<br>${pastille('Trophée déjà produit', 'orange')}` : ''}</td>
        <td>${h(j.gie)}</td>
        <td>${h(j.nom)}</td>
        <td>${(j.changements || []).map(c => `<div>${c.champ && !['import', 'formulaire', 'lot', 'gie', 'expedition'].includes(c.champ) ? `<small>${h(LIBELLES_CHAMPS[c.champ] || c.champ)}</small> ` : ''}${c.avant !== '' && c.avant !== undefined ? `<s>${h(c.avant)}</s> → ` : ''}${h(c.apres)}</div>`).join('')}</td>
        <td><small>${h(j.auteur)}</small></td>
      </tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune entrée.</td></tr>'}</tbody>
    </table></div>
    ${pages > 1 ? `<div class="pagination"><button class="btn petit" id="prec" ${F.page === 0 ? 'disabled' : ''}>‹ Plus récentes</button><span>Page ${F.page + 1} / ${pages}</span><button class="btn petit" id="suiv" ${F.page >= pages - 1 ? 'disabled' : ''}>Plus anciennes ›</button></div>` : ''}`;

  const maj = () => vueJournal(root, ctx);
  let t;
  root.querySelector('#f-texte').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.texte = e.target.value; F.page = 0; maj(); const v = root.querySelector('#f-texte'); v.focus(); v.setSelectionRange(v.value.length, v.value.length); }, 250); };
  root.querySelector('#f-type').onchange = e => { F.type = e.target.value; F.page = 0; maj(); };
  root.querySelector('#f-gie').onchange = e => { F.gie = e.target.value; F.page = 0; maj(); };
  root.querySelector('#f-trophee').onchange = e => { F.trophee = e.target.checked; F.page = 0; maj(); };
  root.querySelector('#prec')?.addEventListener('click', () => { F.page--; maj(); });
  root.querySelector('#suiv')?.addEventListener('click', () => { F.page++; maj(); });
  root.querySelector('#export').onclick = () => agir(() => exporterJournal(etat, filtre));
  root.querySelectorAll('tr[data-ligne]').forEach(tr => {
    if (!tr.dataset.ligne) return;
    tr.onclick = () => { const x = M.lignes.find(y => y.id === tr.dataset.ligne); if (x) location.hash = `#/recompenses?g=${x.gie}&f=${x.active ? '' : 'supprimees'}`; };
  });
}
