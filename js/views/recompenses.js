import { h, nombre, dateFr, panneau, fermerPanneau, selectHtml, confirmer, metalChip } from '../ui.js';
import { agir, paramHash, badgesProblemes, badgeProd, optionsGie } from './commun.js';
import { PROBLEMES, LIBELLES_CHAMPS, METAUX, norm, normNom, normMetal, effectif } from '../logic.js';
import { corrigerLigne, resoudreConflit, forcerReference, supprimerLigne, ajouterLigne, affecterAdresse } from '../actions.js';
import { TYPES_JOURNAL } from '../exports.js';

const F = { texte: '', gie: '', metal: '', ref: '', etat: '', page: 0 };
const PAR_PAGE = 150;

const FILTRES_ETAT = [
  ['', 'Toutes les lignes actives'], ['pb', 'Avec incohérence'], ['erreur', 'Incohérences bloquantes'], ['conflit', 'Conflits à arbitrer'],
  ['corrige', 'Corrigées à la main'], ['manuel', 'Ajoutées à la main'], ['a_produire', 'À produire'], ['complement', 'Compléments (facturables)'],
  ['sans_adresse', 'Sans adresse (GIE à 2 adresses)'], ['inutile', 'Produites puis supprimées'], ['supprimees', 'Supprimées'],
];

export function vueRecompenses(root, ctx) {
  const { etat, M, lecture } = ctx;
  const filtresActifs = () => [
    F.gie && `GIE ${F.gie}`, F.metal, F.ref && `réf. ${M.num[F.ref] ?? ''}`, F.texte && `« ${F.texte} »`,
    F.etat && (FILTRES_ETAT.find(([k]) => k === F.etat)?.[1] || F.etat),
  ].filter(Boolean).map(t => `<b>${h(t)}</b>`).join(' · ');
  if (ctx.navigation) {
    ctx.navigation = false;
    const f = paramHash('f'); const g = paramHash('g');
    // Un lien (GIE, tableau de bord, journal…) repart de filtres vides puis applique les siens
    if (f !== null || g !== null) Object.assign(F, { texte: '', gie: g || '', metal: '', ref: '', etat: f || '', page: 0 });
  }
  const txt = norm(F.texte);
  const liste = M.lignes.filter(x => {
    if (F.etat === 'supprimees') { if (x.active) return false; } else if (F.etat === 'inutile') { if (x.prod !== 'produit_inutile') return false; } else if (!x.active) return false;
    if (F.gie && x.gie !== F.gie) return false;
    if (F.metal && x.metal !== F.metal) return false;
    if (F.ref && x.refId !== F.ref) return false;
    if (F.etat === 'pb' && !x.niveau) return false;
    if (F.etat === 'erreur' && x.niveau !== 'erreur') return false;
    if (F.etat === 'conflit' && !x.l.conflits?.length) return false;
    if (F.etat === 'corrige' && !Object.keys(x.l.ovr || {}).some(k => k !== 'supprime')) return false;
    if (F.etat === 'manuel' && x.l.origine !== 'manuel') return false;
    if (F.etat === 'a_produire' && x.prod !== 'a_produire') return false;
    if (F.etat === 'complement' && x.prod !== 'complement') return false;
    if (F.etat === 'sans_adresse' && !x.pb.includes('ADRESSE')) return false;
    if (txt && !norm(`${x.e.nom} ${x.agence} ${x.e.categorie} ${x.gie} ${x.e.codeAgence}`).includes(txt)) return false;
    return true;
  }).sort((a, b) => (a.gie.localeCompare(b.gie)) || ((a.num || 999) - (b.num || 999)) || a.agence.localeCompare(b.agence));
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  F.page = Math.min(F.page, pages - 1);
  const vis = liste.slice(F.page * PAR_PAGE, (F.page + 1) * PAR_PAGE);
  const gieFiltre = F.gie ? etat.gies[F.gie] : null;
  const deuxAdresses = (gieFiltre?.adresses?.length || 0) > 1;
  const refsOpt = [['', 'Toutes les références'], ...M.refsTri.filter(r => !F.metal || r.metal === F.metal).map(r => [r.id, `${M.num[r.id]} · ${r.metal} – ${r.libelle}`])];

  const cellule = (x, champ, valeur) => {
    const corrige = x.l.ovr && champ in x.l.ovr && x.l.src;
    const conflit = x.l.conflits?.some(c => c.champ === champ);
    const titre = corrige ? `Corrigé à la main. Valeur du fichier client : « ${x.l.src[champ] ?? ''} »` : '';
    return `<td class="${corrige ? 'corrige' : ''} ${conflit ? 'conflit' : ''}" ${titre ? `title="${h(titre)}"` : ''}>${valeur}</td>`;
  };

  root.innerHTML = `
    <header class="entete"><div><h1>Récompenses</h1><p class="sous-titre">${nombre(liste.length)} ligne(s) · les cellules soulignées en bleu ont été corrigées à la main et ne sont pas écrasées par le fichier client</p></div>
      ${lecture ? '' : '<button class="btn principal" id="ajout">+ Ajouter une récompense</button>'}</header>
    <div class="filtres">
      <input type="search" id="f-texte" placeholder="Rechercher un nom, une agence…" value="${h(F.texte)}">
      ${selectHtml('gie', optionsGie(M), F.gie, 'id="f-gie"')}
      ${selectHtml('metal', [['', 'Tous les métaux'], ...METAUX.map(m => [m, m])], F.metal, 'id="f-metal"')}
      ${selectHtml('ref', refsOpt, F.ref, 'id="f-ref"')}
      ${selectHtml('etat', FILTRES_ETAT, F.etat, 'id="f-etat"')}
    </div>
    ${filtresActifs() ? `<div class="filtres-actifs">Filtres actifs : ${filtresActifs()} <button class="btn petit lien" id="effacer">Effacer les filtres</button></div>` : ''}
    <div class="legende"><span class="l-erreur-ex">Bloquant</span><span class="l-alerte-ex">À vérifier</span><span class="corrige-ex">Corrigé à la main</span><span class="conflit-ex">Conflit</span></div>
    ${deuxAdresses && !lecture ? `<div class="barre-actions">Livraison en 2 adresses pour ce GIE. Lignes cochées → ${gieFiltre.adresses.map((a, i) => `<button class="btn petit" data-adr="${i}">${h(a.libelle || `Adresse ${i + 1}`)}</button>`).join(' ')} <button class="btn petit lien" data-adr="">Retirer l'adresse</button></div>` : ''}
    <div class="table-defile"><table class="table dense">
      <thead><tr>${deuxAdresses && !lecture ? '<th><input type="checkbox" id="tout"></th>' : ''}<th>GIE</th><th>Agence</th><th>Civ.</th><th>Nom</th><th>Catégorie (fichier client)</th><th>Métal</th><th>Référence trophée</th>${deuxAdresses ? '<th>Adresse</th>' : ''}<th>Production</th><th>Incohérences</th></tr></thead>
      <tbody>${vis.map(x => `<tr class="cliquable ${x.niveau ? `l-${x.niveau}` : ''} ${x.active ? '' : 'l-supprimee'}" data-id="${x.id}">
        ${deuxAdresses && !lecture ? `<td class="coche"><input type="checkbox" data-sel="${x.id}"></td>` : ''}
        ${cellule(x, 'gie', `<strong>${h(x.gie)}</strong>`)}
        ${cellule(x, 'agence', h(x.agence))}
        ${cellule(x, 'civilite', h(x.e.civilite === 'Madame' || x.e.civilite === 'madame' ? 'Mme' : x.e.civilite === 'Monsieur' ? 'M.' : x.e.civilite))}
        ${cellule(x, 'nom', h(x.e.nom))}
        ${cellule(x, 'categorie', h(x.e.categorie))}
        ${cellule(x, 'recompense', metalChip(x.metal || x.e.recompense))}
        <td>${x.refId ? `<span class="ref"><b>${x.num}</b> ${h(etat.references[x.refId]?.libelle)}</span>${x.l.ovr?.refManuel ? ' <small title="Référence forcée à la main">✎</small>' : ''}` : '<span class="rouge-texte">—</span>'}</td>
        ${deuxAdresses ? `<td>${h(gieFiltre.adresses[x.l.adresseIdx]?.libelle || '')}</td>` : ''}
        <td>${badgeProd(x.prod)}</td>
        <td>${badgesProblemes(x.pb)}</td>
      </tr>`).join('') || `<tr><td colspan="11" class="vide">Aucune ligne ne correspond aux filtres${filtresActifs() ? ` (${filtresActifs()})` : ''}.</td></tr>`}</tbody>
    </table></div>
    ${pages > 1 ? `<div class="pagination"><button class="btn petit" id="prec" ${F.page === 0 ? 'disabled' : ''}>‹ Précédent</button><span>Page ${F.page + 1} / ${pages}</span><button class="btn petit" id="suiv" ${F.page >= pages - 1 ? 'disabled' : ''}>Suivant ›</button></div>` : ''}`;

  const maj = () => vueRecompenses(root, ctx);
  root.querySelector('#effacer')?.addEventListener('click', () => { Object.assign(F, { texte: '', gie: '', metal: '', ref: '', etat: '', page: 0 }); maj(); });
  let t;
  root.querySelector('#f-texte').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.texte = e.target.value; F.page = 0; maj(); root.querySelector('#f-texte').focus(); const v = root.querySelector('#f-texte'); v.setSelectionRange(v.value.length, v.value.length); }, 250); };
  root.querySelector('#f-gie').onchange = e => { F.gie = e.target.value; F.page = 0; maj(); };
  root.querySelector('#f-metal').onchange = e => { F.metal = e.target.value; F.ref = ''; F.page = 0; maj(); };
  root.querySelector('#f-ref').onchange = e => { F.ref = e.target.value; F.page = 0; maj(); };
  root.querySelector('#f-etat').onchange = e => { F.etat = e.target.value; F.page = 0; maj(); };
  root.querySelector('#prec')?.addEventListener('click', () => { F.page--; maj(); });
  root.querySelector('#suiv')?.addEventListener('click', () => { F.page++; maj(); });
  root.querySelector('#ajout')?.addEventListener('click', () => editer(ctx, null));
  root.querySelector('#tout')?.addEventListener('change', e => root.querySelectorAll('[data-sel]').forEach(c => { c.checked = e.target.checked; }));
  root.querySelectorAll('[data-sel]').forEach(c => c.addEventListener('click', e => e.stopPropagation()));
  root.querySelectorAll('td.coche').forEach(c => c.addEventListener('click', e => e.stopPropagation()));
  root.querySelectorAll('[data-adr]').forEach(b => {
    b.onclick = () => {
      const ids = [...root.querySelectorAll('[data-sel]:checked')].map(c => c.dataset.sel);
      if (!ids.length) return agir(async () => { throw new Error('Cochez d\'abord les lignes à affecter'); });
      return agir(() => affecterAdresse(ids, b.dataset.adr), `${ids.length} ligne(s) affectée(s)`);
    };
  });
  root.querySelectorAll('tr[data-id]').forEach(tr => { tr.onclick = () => editer(ctx, tr.dataset.id); });
}

function editer(ctx, id) {
  const { etat, M, lecture } = ctx;
  const x = id ? M.lignes.find(y => y.id === id) : null;
  const l = x?.l;
  const e = x ? x.e : { gie: ctx.etat && F.gie ? F.gie : '', civilite: '', recompense: '' };
  const categories = [...new Set(M.lignes.map(y => y.e.categorie).filter(Boolean))].sort();
  const gie = etat.gies[e.gie];
  const refsOpt = [['', 'Automatique (selon catégorie, métal et civilité)'], ...M.refsTri.map(r => [r.id, `${M.num[r.id]} · ${r.metal} – ${r.libelle}`])];
  const hist = id ? etat.journal.filter(j => j.ligneId === id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const dis = lecture ? 'disabled' : '';
  const champ = (nom, libelle, html) => {
    const corrige = l?.src && l.ovr && nom in l.ovr;
    return `<label class="${corrige ? 'corrige-champ' : ''}">${libelle}${corrige ? ` <small>· fichier client : « ${h(l.src[nom] ?? '')} »</small>` : ''}${html}</label>`;
  };
  const contenu = `
    ${x ? `<div class="infos-ligne">${badgesProblemes(x.pb)} ${badgeProd(x.prod)}<p class="petit-texte">${l.origine === 'manuel' ? 'Ajoutée à la main' : `Fichier client${l.ligneSource ? `, ligne ${l.ligneSource}` : ''}`}${l.statut === 'supprimee' ? ' · <b>supprimée du fichier client</b>' : ''}${l.ovr?.supprime ? ' · <b>supprimée à la main</b>' : ''}</p></div>` : ''}
    ${(l?.conflits || []).map(c => `<div class="encart rouge"><strong>Conflit sur « ${h(LIBELLES_CHAMPS[c.champ] || c.champ)} »</strong><p>Le client a changé la valeur en « ${h(c.client)} » alors que tu l'avais corrigée en « ${h(c.corrige)} ».</p>${lecture ? '' : `<div class="pile-h"><button class="btn petit" data-conflit="${c.champ}" data-choix="corrige">Garder ma correction</button><button class="btn petit" data-conflit="${c.champ}" data-choix="client">Prendre la valeur du client</button></div>`}</div>`).join('')}
    ${x?.pb.length ? `<ul class="liste-pb">${x.pb.map(p => `<li class="${PROBLEMES[p]?.niveau}">${h(PROBLEMES[p]?.libelle || p)}</li>`).join('')}</ul>` : ''}
    <form id="f-ligne" class="grille-form">
      ${champ('gie', 'GIE', selectHtml('gie', optionsGie(M, '—'), e.gie, dis))}
      ${champ('codeAgence', 'Code agence', `<input name="codeAgence" value="${h(e.codeAgence)}" ${dis}>`)}
      ${champ('agence', 'Agence', `<input name="agence" value="${h(e.agence)}" ${dis}>`)}
      ${champ('civilite', 'Civilité', selectHtml('civilite', [['', '—'], ['Madame', 'Madame'], ['Monsieur', 'Monsieur']], ['Madame', 'Monsieur'].includes(e.civilite) ? e.civilite : (/^mad/i.test(e.civilite || '') ? 'Madame' : /^mon/i.test(e.civilite || '') ? 'Monsieur' : ''), dis))}
      ${champ('nom', 'Nom du lauréat', `<input name="nom" value="${h(e.nom)}" ${dis}>`)}
      ${champ('categorie', 'Catégorie', `<input name="categorie" list="cats" value="${h(e.categorie)}" ${dis}><datalist id="cats">${categories.map(c => `<option value="${h(c)}">`).join('')}</datalist>`)}
      ${champ('recompense', 'Métal', selectHtml('recompense', [['', '—'], ...METAUX.map(m => [m, m])], x?.metal || e.recompense, dis))}
      <label class="large">Référence trophée ${x?.refId ? `<small>· actuellement : <b>${M.num[x.refId]} – ${h(etat.references[x.refId]?.metal)} ${h(etat.references[x.refId]?.libelle)}</b></small>` : ''}${selectHtml('refManuel', refsOpt, l?.ovr?.refManuel || '', dis)}</label>
      ${(gie?.adresses?.length || 0) > 1 ? `<label class="large">Adresse de livraison${selectHtml('adresseIdx', [['', '— à choisir —'], ...gie.adresses.map((a, i) => [i, a.libelle || `Adresse ${i + 1}`])], l?.adresseIdx ?? '', dis)}</label>` : ''}
      ${lecture ? '' : `<div class="pile-h large"><button class="btn principal" type="submit">${x ? 'Enregistrer' : 'Ajouter'}</button>${x ? `<button class="btn ${x.active ? 'danger' : ''}" type="button" id="suppr">${x.active ? 'Supprimer cette récompense' : 'Rétablir'}</button>` : ''}</div>`}
    </form>
    ${x?.prod === 'produit' ? '<p class="petit-texte">Ce trophée a déjà été commandé à l\'usine : un changement de métal, de catégorie ou de civilité créera un complément à produire (facturable). Un changement de nom n\'impacte que le diplôme.</p>' : ''}
    ${hist.length ? `<h3>Historique</h3><ul class="historique">${hist.map(j => `<li><small>${dateFr(j.date, true)} · ${h(j.auteur)}</small><br><b>${h(TYPES_JOURNAL[j.type] || j.type)}</b> ${(j.changements || []).map(c => `${h(LIBELLES_CHAMPS[c.champ] || c.champ)} : <s>${h(c.avant)}</s> → ${h(c.apres)}`).join(' · ')}</li>`).join('')}</ul>` : ''}`;

  panneau(x ? `${h(e.nom || x.agence || 'Récompense')}` : 'Nouvelle récompense', contenu, corps => {
    corps.querySelectorAll('[data-conflit]').forEach(b => { b.onclick = () => agir(async () => { await resoudreConflit(id, b.dataset.conflit, b.dataset.choix); fermerPanneau(); }, 'Conflit arbitré'); });
    corps.querySelector('#suppr')?.addEventListener('click', async () => {
      if (x.active && !(await confirmer(`Supprimer la récompense de ${h(e.nom || x.agence)} ? Elle restera visible dans le journal${x.l.produit ? ' (trophée déjà produit)' : ''}.`, 'Supprimer'))) return;
      agir(async () => { await supprimerLigne(id, !x.active); fermerPanneau(); }, x.active ? 'Récompense supprimée' : 'Récompense rétablie');
    });
    const f = corps.querySelector('#f-ligne');
    f.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f).entries());
      agir(async () => {
        if (!x) {
          if (!d.gie || !d.recompense || !d.categorie) throw new Error('GIE, catégorie et métal sont obligatoires');
          const nid = await ajouterLigne(d);
          if (d.refManuel) await forcerReference(nid, d.refManuel);
          if (d.adresseIdx !== undefined && d.adresseIdx !== '') await affecterAdresse([nid], d.adresseIdx);
        } else {
          const { refManuel, adresseIdx, ...champs } = d;
          // Ne pas transformer « Madame » en correction quand le fichier dit « madame »
          if (normNom(champs.civilite) === normNom(effectif(l).civilite)) delete champs.civilite;
          if (normMetal(champs.recompense) === normMetal(effectif(l).recompense)) delete champs.recompense;
          if ((champs.gie || '') === (effectif(l).gie || '')) delete champs.gie;
          await corrigerLigne(id, champs);
          if ((refManuel || '') !== (l.ovr?.refManuel || '')) await forcerReference(id, refManuel || null);
          if (adresseIdx !== undefined && String(adresseIdx) !== String(l.adresseIdx ?? '')) await affecterAdresse([id], adresseIdx);
        }
        fermerPanneau();
      }, x ? 'Modifications enregistrées et tracées dans le journal' : 'Récompense ajoutée');
    };
  });
}
