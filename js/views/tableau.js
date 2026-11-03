import { h, nombre, dateFr } from '../ui.js';
import { compteMetaux, badgeForm, badgeExpe, pastille } from './commun.js';
import { STATUTS_LOT } from '../model.js';

export function vueTableau(root, { etat, M, user }) {
  const s = M.stats;
  const gies = M.giesTries.filter(g => g.total > 0);
  const livres = gies.filter(g => g.expedition === 'livre').length;
  const formsAttente = gies.filter(g => ['envoye'].includes(g.gie.formulaire?.statut)).length;
  const formsRepondus = gies.filter(g => g.gie.formulaire?.statut === 'repondu').length;
  const lots = Object.values(etat.lots).sort((a, b) => b.numero - a.numero);
  const tuile = (titre, valeur, detail = '', classe = '', lien = '') => `<a class="tuile ${classe}" ${lien ? `href="${lien}"` : ''}><span class="t">${titre}</span><strong>${valeur}</strong><small>${detail}</small></a>`;
  const etatProdGie = g => ({
    a_produire: pastille('À lancer', 'gris'), brouillon: pastille('Lot en préparation', 'bleu-clair'), en_cours: pastille('En production', 'bleu'),
    recu: pastille('Reçu', 'vert'), complement: pastille(`Complément : ${g.prod.complement + g.prod.a_produire}`, 'orange'),
  }[g.etatProd] || '');

  root.innerHTML = `
    <header class="entete"><div><h1>Tableau de bord</h1><p class="sous-titre">Édition ${h(etat.parametres.edition)} · ${gies.length} régions · mis à jour en temps réel</p></div></header>
    <section class="tuiles">
      ${tuile('Trophées', nombre(s.total), `${nombre(s.metaux.Platine)} platine · ${nombre(s.metaux.Or)} or · ${nombre(s.metaux.Argent)} argent · ${nombre(s.metaux.Bronze)} bronze`, '', '#/recompenses')}
      ${tuile('Incohérences', nombre(s.erreur + s.alerte), `${nombre(s.erreur)} bloquante(s) · ${nombre(s.alerte)} à vérifier`, s.erreur ? 'rouge' : s.alerte ? 'orange' : 'vert', '#/recompenses?f=pb')}
      ${user.role === 'equipe' ? tuile('À produire', nombre(s.a_produire + s.complement), `dont ${nombre(s.complement)} complément(s) facturable(s)`, s.complement ? 'orange' : '', '#/productions') : ''}
      ${tuile('Formulaires', `${formsRepondus} à valider`, `${formsAttente} en attente de réponse`, formsRepondus ? 'bleu' : '', '#/gies')}
      ${tuile('Livraisons', `${livres} / ${gies.length}`, 'régions livrées', livres === gies.length && gies.length ? 'vert' : '', '#/expeditions')}
      ${s.produit_inutile ? tuile('Produits inutilisés', nombre(s.produit_inutile), 'trophées produits puis supprimés', 'violet', '#/recompenses?f=inutile') : ''}
    </section>
    ${user.role === 'equipe' && lots.length ? `<section class="carte"><h2>Dernières productions</h2><div class="lots-mini">${lots.slice(0, 4).map(l => `<a href="#/productions" class="lot-mini"><strong>Lot ${l.numero}</strong><span>${h(l.libelle)}</span>${pastille(STATUTS_LOT[l.statut], l.statut === 'recu' ? 'vert' : l.statut === 'brouillon' ? 'gris' : 'bleu')}</a>`).join('')}</div></section>` : ''}
    <section class="carte">
      <h2>Avancement par région <small>(ordre de priorité)</small></h2>
      <div class="table-defile"><table class="table">
        <thead><tr><th>Prio.</th><th>GIE</th><th>Trophées <small>P · O · A · B</small></th><th class="num">Total</th><th>Incohérences</th><th>Formulaire</th><th>Livraison souhaitée</th><th>Production</th><th>Expédition</th></tr></thead>
        <tbody>${gies.map(g => `<tr class="cliquable" data-gie="${g.code}">
          <td class="num">${g.gie.priorite || ''}</td>
          <td><strong>${g.code}</strong> ${h(g.gie.nom)}${g.alertes?.length ? ` <span class="avert" title="${h(g.alertes.join('\n'))}">⚠</span>` : ''}</td>
          <td>${compteMetaux(g.metaux)}</td>
          <td class="num"><strong>${g.total}</strong></td>
          <td>${g.pb.erreur ? pastille(g.pb.erreur, 'rouge') : ''} ${g.pb.alerte ? pastille(g.pb.alerte, 'orange') : ''}</td>
          <td>${badgeForm(g.gie.formulaire?.statut)}</td>
          <td>${h(g.gie.dateSouhaitee ? dateFr(g.gie.dateSouhaitee) : g.gie.souhaitTexte || '')}</td>
          <td>${etatProdGie(g)}</td>
          <td>${badgeExpe(g.expedition)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  root.querySelectorAll('tr[data-gie]').forEach(tr => { tr.onclick = () => { location.hash = `#/gies?g=${tr.dataset.gie}`; }; });
}
