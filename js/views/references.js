import { h, panneau, fermerPanneau, selectHtml, confirmer, metalChip } from '../ui.js';
import { agir } from './commun.js';
import { ajouterReference, majReference, deplacerReference, supprimerReference, majParametres } from '../actions.js';
import { catCle, normMetal, METAUX } from '../logic.js';

const CIV = { M: 'Monsieur', F: 'Madame', '*': 'Tous' };

export function vueReferences(root, ctx) {
  const { etat, M } = ctx;
  // Catégories du fichier client sans référence correspondante
  const orphelines = new Map();
  for (const x of M.lignes) {
    if (!x.active || !x.pb.includes('CAT_INCONNUE')) continue;
    const k = `${x.metal}|${catCle(x.e.categorie).cle}`;
    if (!orphelines.has(k)) orphelines.set(k, { metal: x.metal, cat: x.e.categorie, nb: 0 });
    orphelines.get(k).nb++;
  }
  root.innerHTML = `
    <header class="entete"><div><h1>Références trophées</h1><p class="sous-titre">${M.refsTri.length} références. La numérotation se recalcule automatiquement selon l'ordre des métaux et l'ordre dans chaque liste.</p></div></header>
    <section class="carte"><h2>Ordre des métaux</h2><div class="pile-h ordre-metaux">${M.ordreMetaux.map((m, i) => `<span class="chip-ordre">${metalChip(m)}${i > 0 ? `<button class="btn-icone" data-om="${i}" title="Avancer">◀</button>` : ''}</span>`).join('')}</div></section>
    ${orphelines.size ? `<div class="encart orange"><strong>Catégories du fichier client sans référence</strong><ul>${[...orphelines.values()].map(o => `<li>${metalChip(o.metal)} « ${h(o.cat)} » – ${o.nb} trophée(s) <button class="btn petit" data-creer="${h(o.metal)}|${h(o.cat)}">Créer une référence</button></li>`).join('')}</ul></div>` : ''}
    <div class="colonnes-metaux">${M.ordreMetaux.map(m => {
      const rs = M.refsTri.filter(r => r.metal === m);
      return `<section class="carte metal-col"><h2>${metalChip(m)} <small>${rs.length} réf. · ${rs.reduce((s, r) => s + (M.qteParRef[r.id] || 0), 0)} trophées</small></h2>
        <table class="table dense"><tbody>${rs.map((r, i) => `<tr class="cliquable" data-ref="${r.id}">
          <td class="num"><strong>${M.num[r.id]}</strong></td>
          <td>${h(r.libelle)}<br><small>${(r.regles || []).map(g => `${h(g.cat)}${g.civ !== '*' ? ` · ${CIV[g.civ]}` : ''}`).join(' / ') || '<span class="rouge-texte">aucune règle</span>'}</small></td>
          <td class="num">${M.qteParRef[r.id] || ''}</td>
          <td class="poignee"><button class="btn-icone" data-mv="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn-icone" data-mv="1" ${i === rs.length - 1 ? 'disabled' : ''}>▼</button></td>
        </tr>`).join('')}</tbody></table>
        <button class="btn petit" data-ajout="${m}">+ Ajouter une référence ${m}</button></section>`;
    }).join('')}</div>`;

  root.querySelectorAll('[data-om]').forEach(b => {
    b.onclick = () => { const o = [...M.ordreMetaux]; const i = Number(b.dataset.om); [o[i - 1], o[i]] = [o[i], o[i - 1]]; agir(() => majParametres({ ordreMetaux: o })); };
  });
  root.querySelectorAll('[data-mv]').forEach(b => { b.onclick = e => { e.stopPropagation(); agir(() => deplacerReference(b.closest('tr').dataset.ref, Number(b.dataset.mv))); }; });
  root.querySelectorAll('tr[data-ref]').forEach(tr => { tr.onclick = () => editer(ctx, tr.dataset.ref); });
  root.querySelectorAll('[data-ajout]').forEach(b => { b.onclick = () => editer(ctx, null, { metal: b.dataset.ajout }); });
  root.querySelectorAll('[data-creer]').forEach(b => {
    b.onclick = () => { const [metal, cat] = b.dataset.creer.split('|'); editer(ctx, null, { metal, libelle: cat, regles: [{ cat, civ: '*' }] }); };
  });
}

function editer(ctx, id, defaut = {}) {
  const { etat, M } = ctx;
  const r = id ? etat.references[id] : { metal: defaut.metal || 'Or', libelle: defaut.libelle || '', regles: defaut.regles || [{ cat: '', civ: '*' }] };
  const categories = [...new Set(M.lignes.map(x => x.e.categorie).filter(Boolean))].sort();
  const regleHtml = (g, i) => `<div class="regle" data-i="${i}"><input name="cat" list="cats-ref" value="${h(g.cat)}" placeholder="ex. Conseiller en transaction" title="${h(g.cat)}">${selectHtml('civ', Object.entries(CIV), g.civ || '*')}<button type="button" class="btn-icone" data-retirer title="Retirer cette règle">✕</button></div>`;
  panneau(id ? `Référence ${M.num[id]}` : 'Nouvelle référence', `
    <form id="f-ref" class="pile">
      <label>Métal${selectHtml('metal', METAUX.map(m => [m, m]), r.metal)}</label>
      <label>Libellé du trophée<input name="libelle" value="${h(r.libelle)}" required></label>
      <div><strong>Règles d'attribution</strong><p class="petit-texte">Une ligne du fichier client reçoit cette référence si sa catégorie et son métal correspondent (et la civilité si elle est précisée).</p>
        <div class="regles-entete"><span>Catégorie du fichier client</span><span>Civilité</span><span></span></div>
        <div id="regles">${(r.regles || []).map(regleHtml).join('')}</div>
        <datalist id="cats-ref">${categories.map(c => `<option value="${h(c)}">`).join('')}</datalist>
        <button type="button" class="btn petit" id="plus">+ Ajouter une règle</button></div>
      <div class="pile-h"><button class="btn principal" type="submit">Enregistrer</button>${id ? `<button type="button" class="btn danger" id="suppr">Supprimer</button>` : ''}</div>
      ${id ? `<p class="petit-texte">${M.qteParRef[id] || 0} trophée(s) utilisent actuellement cette référence.</p>` : ''}
    </form>`, corps => {
    const zone = corps.querySelector('#regles');
    const brancher = () => zone.querySelectorAll('[data-retirer]').forEach(b => { b.onclick = () => b.closest('.regle').remove(); });
    brancher();
    corps.querySelector('#plus').onclick = () => { zone.insertAdjacentHTML('beforeend', regleHtml({ cat: '', civ: '*' }, zone.children.length)); brancher(); };
    corps.querySelector('#suppr')?.addEventListener('click', async () => {
      const n = M.qteParRef[id] || 0;
      if (!(await confirmer(n ? `${n} trophée(s) utilisent cette référence : ils passeront en incohérence « catégorie sans référence ». Supprimer quand même ?` : 'Supprimer cette référence ?', 'Supprimer'))) return;
      agir(async () => { await supprimerReference(id); fermerPanneau(); }, 'Référence supprimée');
    });
    corps.querySelector('#f-ref').onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target;
      const regles = [...zone.querySelectorAll('.regle')].map(d => ({ cat: d.querySelector('[name=cat]').value.trim(), civ: d.querySelector('[name=civ]').value })).filter(g => g.cat);
      const metal = normMetal(f.metal.value);
      agir(async () => {
        if (id) {
          const modifs = { libelle: f.libelle.value.trim(), regles, metal };
          if (metal !== r.metal) modifs.ordre = Math.max(0, ...Object.values(etat.references).filter(x => x.metal === metal).map(x => x.ordre)) + 10;
          await majReference(id, modifs);
        } else await ajouterReference(metal, f.libelle.value.trim(), regles);
        fermerPanneau();
      }, 'Référence enregistrée – numérotation mise à jour');
    };
  });
}
