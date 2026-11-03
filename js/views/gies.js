import { h, dateFr, panneau, fermerPanneau, selectHtml, modale, toast, confirmer } from '../ui.js';
import { agir, paramHash, compteMetaux, badgeForm, badgeExpe, pastille } from './commun.js';
import { majGie, ordonnerGies, envoyerFormulaire, validerReponse, agencesDuGie, affecterAdresse, lienFormulaire } from '../actions.js';
import { store } from '../store.js';
import { STATUTS_BAT } from '../model.js';
import { MODE, COMPTE_ENVOI } from '../config.js';

const F = { texte: '', statut: '' };

export function vueGies(root, ctx) {
  const { M, lecture } = ctx;
  const gies = M.giesTries.filter(g => !F.statut || (g.gie.formulaire?.statut || 'a_envoyer') === F.statut)
    .filter(g => !F.texte || `${g.code} ${g.gie.nom} ${g.gie.contact?.nom}`.toLowerCase().includes(F.texte.toLowerCase()));
  const glisser = !lecture && !F.texte && !F.statut;
  root.innerHTML = `
    <header class="entete"><div><h1>Régions & livraisons</h1><p class="sous-titre">${glisser ? 'Glisse les lignes (ou utilise ▲▼) pour fixer l\'ordre de priorité des livraisons.' : 'Ordre de priorité des livraisons.'}</p></div>
      ${lecture ? '' : '<div class="pile-h"><button class="btn" id="envoi-groupe">Envoyer le formulaire aux GIE cochés</button></div>'}</header>
    <div class="filtres">
      <input type="search" id="f-texte" placeholder="Rechercher un GIE, un contact…" value="${h(F.texte)}">
      ${selectHtml('statut', [['', 'Tous les formulaires'], ['a_envoyer', 'À envoyer'], ['envoye', 'Envoyés, sans réponse'], ['repondu', 'Réponse à valider'], ['valide', 'Validés']], F.statut, 'id="f-statut"')}
    </div>
    <div class="table-defile"><table class="table" id="t-gies">
      <thead><tr>${lecture ? '' : '<th><input type="checkbox" id="tout"></th><th></th>'}<th>Prio.</th><th>GIE</th><th>Contact</th><th>Trophées</th><th>Adresse(s) de livraison</th><th>Date souhaitée</th><th>Formulaire</th><th>Expédition</th></tr></thead>
      <tbody>${gies.map(g => {
        const G = g.gie;
        const adr = G.adresses || [];
        return `<tr data-gie="${g.code}" class="cliquable" ${glisser ? 'draggable="true"' : ''}>
          ${lecture ? '' : `<td class="coche"><input type="checkbox" data-sel="${g.code}"></td><td class="poignee">${glisser ? '<span title="Glisser">⠿</span><button class="btn-icone" data-mv="-1" title="Monter">▲</button><button class="btn-icone" data-mv="1" title="Descendre">▼</button>' : ''}</td>`}
          <td class="num"><strong>${G.priorite || ''}</strong></td>
          <td><strong>${g.code}</strong> ${h(G.nom)}${g.alertes?.length ? `<div class="avert-texte">⚠ ${h(g.alertes.join(' · '))}</div>` : ''}</td>
          <td>${h(`${G.contact?.prenom || ''} ${G.contact?.nom || ''}`)}<br><small>${h(G.contact?.email || '')} ${h(G.contact?.tel || '')}</small></td>
          <td>${compteMetaux(g.metaux)} <strong>${g.total}</strong></td>
          <td class="adresses">${adr.map(a => `<div><b>${h(a.libelle || '')}</b>${adr.length > 1 || a.texte ? `<br><small>${h((a.texte || '— à compléter').split('\n').slice(0, 3).join(', '))}</small>` : ''}</div>`).join('')}</td>
          <td>${h(G.dateSouhaitee ? dateFr(G.dateSouhaitee) : G.souhaitTexte || '')}${G.dateConvention ? `<br><small>Convention : ${h(/^\d{4}-/.test(G.dateConvention) ? dateFr(G.dateConvention) : G.dateConvention)}</small>` : ''}</td>
          <td>${badgeForm(G.formulaire?.statut)}${G.formulaire?.relances?.length ? `<br><small>${G.formulaire.relances.length} relance(s)</small>` : ''}</td>
          <td>${badgeExpe(g.expedition)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

  const maj = () => vueGies(root, ctx);
  let t;
  root.querySelector('#f-texte').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.texte = e.target.value; maj(); const v = root.querySelector('#f-texte'); v.focus(); v.setSelectionRange(v.value.length, v.value.length); }, 250); };
  root.querySelector('#f-statut').onchange = e => { F.statut = e.target.value; maj(); };
  root.querySelectorAll('tr[data-gie]').forEach(tr => { tr.onclick = () => ouvrirGie(ctx, tr.dataset.gie); });
  root.querySelectorAll('td.coche').forEach(td => td.addEventListener('click', e => e.stopPropagation()));
  root.querySelector('#tout')?.addEventListener('change', e => root.querySelectorAll('[data-sel]').forEach(c => { c.checked = e.target.checked; }));
  const ordre = M.giesTries.map(g => g.code);
  root.querySelectorAll('[data-mv]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const code = b.closest('tr').dataset.gie;
      const i = ordre.indexOf(code); const j = i + Number(b.dataset.mv);
      if (j < 0 || j >= ordre.length) return;
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
      agir(() => ordonnerGies(ordre));
    };
  });
  if (glisser) {
    let source = null;
    root.querySelectorAll('tr[draggable]').forEach(tr => {
      tr.addEventListener('dragstart', e => { source = tr.dataset.gie; tr.classList.add('glisse'); e.dataTransfer.effectAllowed = 'move'; });
      tr.addEventListener('dragend', () => tr.classList.remove('glisse'));
      tr.addEventListener('dragover', e => { e.preventDefault(); tr.classList.add('survol'); });
      tr.addEventListener('dragleave', () => tr.classList.remove('survol'));
      tr.addEventListener('drop', e => {
        e.preventDefault(); tr.classList.remove('survol');
        const cible = tr.dataset.gie;
        if (!source || source === cible) return;
        const o = ordre.filter(c => c !== source);
        o.splice(o.indexOf(cible) + (ordre.indexOf(source) < ordre.indexOf(cible) ? 1 : 0), 0, source);
        agir(() => ordonnerGies(o), 'Priorités mises à jour');
      });
    });
  }
  root.querySelector('#envoi-groupe')?.addEventListener('click', async () => {
    const codes = [...root.querySelectorAll('[data-sel]:checked')].map(c => c.dataset.sel);
    if (!codes.length) return toast('Coche d\'abord les GIE concernés', 'info');
    const sansMail = codes.filter(c => !ctx.etat.gies[c].contact?.email);
    if (!(await confirmer(`Envoyer le formulaire de livraison à ${codes.length - sansMail.length} GIE ?${sansMail.length ? `<br><br>Sans e-mail (ignorés) : ${sansMail.join(', ')}` : ''}`, 'Envoyer'))) return;
    let ok = 0;
    for (const c of codes.filter(x => !sansMail.includes(x))) {
      const relance = ['envoye', 'repondu'].includes(ctx.etat.gies[c].formulaire?.statut);
      if (await agir(() => envoyerFormulaire(c, { relance }))) ok++;
    }
    toast(`${ok} formulaire(s) envoyé(s)${MODE === 'demo' ? ' (simulation en mode démo)' : ''}`);
  });

  const g = paramHash('g');
  if (g && ctx.navigation) { ctx.navigation = false; ouvrirGie(ctx, g); }
}

export async function ouvrirGie(ctx, code) {
  const { etat, M, lecture } = ctx;
  const G = etat.gies[code];
  if (!G) return;
  const g = M.parGie[code];
  const dis = lecture ? 'disabled' : '';
  const f = { ...(G.formulaire || { statut: 'a_envoyer' }) };
  const reponse = f.token ? await store.lireFormulaire(f.token).catch(() => null) : null;
  const agences = (G.adresses?.length || 0) > 1 ? agencesDuGie(code) : [];
  const adr = G.adresses?.length ? G.adresses : [{ libelle: 'Adresse de livraison', texte: '' }];
  const r = reponse?.reponse;
  if (reponse?.statut === 'repondu' && f.statut === 'envoye') f.statut = 'repondu';

  const contenu = `
    <div class="resume-gie">${compteMetaux(g.metaux)} <strong>${g.total} trophées</strong> <a href="#/recompenses?g=${code}" class="btn petit lien">Voir les récompenses</a>
      ${g.alertes?.length ? `<ul class="liste-pb">${g.alertes.map(a => `<li class="alerte">${h(a)}</li>`).join('')}</ul>` : ''}</div>
    <section class="bloc"><h3>Formulaire de livraison ${badgeForm(f.statut)}</h3>
      <p class="petit-texte">${f.envoyeLe ? `Envoyé le ${dateFr(f.envoyeLe, true)}` : 'Pas encore envoyé'}${f.relances?.length ? ` · relancé ${f.relances.length} fois (dernière : ${dateFr(f.relances.at(-1), true)})` : ''}${f.reponduLe || reponse?.reponduLe ? ` · réponse le ${dateFr(f.reponduLe || reponse.reponduLe, true)}` : ''}${f.valideLe ? ` · validé le ${dateFr(f.valideLe)}` : ''}</p>
      ${r ? `<div class="encart bleu"><strong>Réponse du contact</strong>
        <p>Date souhaitée : <b>${r.date ? dateFr(r.date) : '—'}</b></p>
        ${(r.adresses || []).map((a, i) => `<p><b>${h(a.libelle || `Adresse ${i + 1}`)}</b><br>${h([a.societe, a.adresse, `${a.cp || ''} ${a.ville || ''}`].filter(x => x && x.trim()).join(', '))}<br>Contact sur place : ${h(a.contact || '—')} ${h(a.tel || '')} ${h(a.email || '')}</p>`).join('')}
        ${r.affectations && (r.adresses || []).length > 1 ? `<details><summary>Répartition des agences</summary><ul>${Object.entries(r.affectations).map(([k, v]) => `<li>${h((reponse.agences || []).find(a => a.cle === k)?.agence || k)} → ${h(r.adresses[v]?.libelle || `Adresse ${Number(v) + 1}`)}</li>`).join('')}</ul></details>` : ''}
        ${r.commentaire ? `<p>Commentaire : ${h(r.commentaire)}</p>` : ''}
        ${!lecture && f.statut !== 'valide' ? '<button class="btn principal petit" id="valider">Valider et reporter ces informations</button>' : ''}</div>` : ''}
      ${lecture ? '' : `<div class="pile-h">
        <button class="btn petit" id="apercu">Aperçu de l'e-mail</button>
        ${f.statut === 'a_envoyer' || !f.statut ? '<button class="btn principal petit" id="envoyer">Envoyer le formulaire</button>' : '<button class="btn petit" id="relancer">Relancer</button><button class="btn petit lien" id="renvoyer">Renvoyer le 1er e-mail</button>'}
        ${f.token ? `<a class="btn petit lien" href="${lienFormulaire(f.token)}" target="_blank">Ouvrir le formulaire</a>` : ''}
      </div>`}
    </section>
    <form id="f-gie">
      <section class="bloc"><h3>Contact du GIE</h3><div class="grille-form">
        <label>Prénom<input name="prenom" value="${h(G.contact?.prenom)}" ${dis}></label>
        <label>Nom<input name="nom" value="${h(G.contact?.nom)}" ${dis}></label>
        <label>Téléphone<input name="tel" value="${h(G.contact?.tel)}" ${dis}></label>
        <label>E-mail <small>(destinataire du formulaire)</small><input name="email" type="text" value="${h(G.contact?.email)}" ${dis} placeholder="contact@orpi.com"></label>
      </div></section>
      <section class="bloc"><h3>Livraison</h3><div class="grille-form">
        <label>Date de livraison souhaitée<input type="date" name="dateSouhaitee" value="${h(/^\d{4}-\d{2}-\d{2}$/.test(G.dateSouhaitee || '') ? G.dateSouhaitee : '')}" ${dis}></label>
        <label>Date de convention / remise<input name="dateConvention" value="${h(G.dateConvention)}" ${dis}></label>
        <label class="large">Précisions (période souhaitée…)<input name="souhaitTexte" value="${h(G.souhaitTexte)}" ${dis}></label>
        <label>Nombre d'adresses${selectHtml('nbAdresses', [[1, '1 adresse'], [2, '2 adresses']], adr.length > 1 ? 2 : 1, `${dis} id="nb-adr"`)}</label>
      </div>
      <div id="adresses">${[0, 1].map(i => `<fieldset class="adresse ${i >= adr.length ? 'cache' : ''}" data-i="${i}"><legend>Adresse ${i + 1}</legend><div class="grille-form">
        <label>Libellé<input name="a${i}_libelle" value="${h(adr[i]?.libelle || (i ? 'Adresse 2' : 'Adresse de livraison'))}" ${dis}></label>
        <label>Contact sur place<input name="a${i}_contact" value="${h(adr[i]?.contactSurPlace)}" ${dis}></label>
        <label class="large">Adresse<textarea name="a${i}_texte" rows="4" ${dis}>${h(adr[i]?.texte)}</textarea></label>
        <label>Téléphone sur place<input name="a${i}_tel" value="${h(adr[i]?.tel)}" ${dis}></label>
      </div></fieldset>`).join('')}</div></section>
      ${agences.length ? `<section class="bloc"><h3>Répartition des trophées entre les 2 adresses</h3><table class="table dense"><thead><tr><th>Agence</th><th class="num">Trophées</th><th>Livrer à</th></tr></thead><tbody>
        ${agences.map(a => `<tr><td>${h(a.agence)}</td><td class="num">${a.nb}</td><td>${selectHtml(`ag_${a.cle}`, [['', a.adresseIdx === 'mixte' ? 'Mixte' : '— à choisir —'], ...adr.map((x, i) => [i, x.libelle || `Adresse ${i + 1}`])], a.adresseIdx === 'mixte' ? '' : a.adresseIdx ?? '', `${dis} data-agence="${h(a.cle)}"`)}</td></tr>`).join('')}
      </tbody></table></section>` : ''}
      <section class="bloc"><h3>Diplômes & suivi</h3><div class="grille-form">
        <label>BAT diplômes${selectHtml('bat', Object.entries(STATUTS_BAT), G.diplomes?.bat || 'a_faire', dis)}</label>
        <label class="large">Commentaires<textarea name="commentaires" rows="3" ${dis}>${h(G.commentaires)}</textarea></label>
      </div></section>
      ${lecture ? '' : '<div class="pied-panneau"><button class="btn principal" type="submit">Enregistrer</button></div>'}
    </form>`;

  panneau(`${code} – ${h(G.nom)}`, contenu, corps => {
    const nb = corps.querySelector('#nb-adr');
    nb?.addEventListener('change', () => corps.querySelectorAll('fieldset.adresse').forEach(fs => fs.classList.toggle('cache', Number(fs.dataset.i) >= Number(nb.value))));
    corps.querySelectorAll('[data-agence]').forEach(s => {
      s.onchange = () => {
        const a = agences.find(x => x.cle === s.dataset.agence);
        agir(() => affecterAdresse(a.ids, s.value), `${a.nb} trophée(s) affecté(s)`);
      };
    });
    const form = corps.querySelector('#f-gie');
    form.onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      const n = Number(d.nbAdresses || 1);
      const adresses = Array.from({ length: n }, (_, i) => ({ libelle: d[`a${i}_libelle`] || '', texte: d[`a${i}_texte`] || '', contactSurPlace: d[`a${i}_contact`] || '', tel: d[`a${i}_tel`] || '' }));
      agir(async () => {
        await majGie(code, {
          contact: { prenom: d.prenom, nom: d.nom, tel: d.tel, email: d.email.trim() },
          dateSouhaitee: d.dateSouhaitee, dateConvention: d.dateConvention, souhaitTexte: d.souhaitTexte,
          adresses, commentaires: d.commentaires, diplomes: { ...(G.diplomes || {}), bat: d.bat, ...(d.bat !== G.diplomes?.bat && ['valide', 'imprime'].includes(d.bat) ? { batLe: new Date().toISOString() } : {}) },
        });
        if (n === 1 && (G.adresses?.length || 0) > 1) await affecterAdresse(g.lignes.map(x => x.id), null);
        fermerPanneau();
      }, 'GIE enregistré');
    };
    const envoi = relance => agir(async () => {
      const { message, token } = await envoyerFormulaire(code, { relance });
      if (MODE === 'demo') await apercuMail(message, token, true);
      else toast(`E-mail envoyé à ${h(message.a)}`);
      fermerPanneau();
    });
    corps.querySelector('#envoyer')?.addEventListener('click', () => envoi(false));
    corps.querySelector('#renvoyer')?.addEventListener('click', () => envoi(false));
    corps.querySelector('#relancer')?.addEventListener('click', () => envoi(true));
    corps.querySelector('#apercu')?.addEventListener('click', () => agir(async () => {
      const { message, token } = await envoyerFormulaire(code, { relance: ['envoye', 'repondu'].includes(f.statut), previsualiser: true });
      await apercuMail(message, token, false);
    }));
    corps.querySelector('#valider')?.addEventListener('click', () => agir(async () => { await validerReponse(code); fermerPanneau(); }, 'Réponse validée : date, adresse(s) et contact reportés sur le GIE'));
  });
}

async function apercuMail(m, token, envoye) {
  await modale(envoye ? 'E-mail préparé (mode démo : rien n\'est envoyé)' : 'Aperçu de l\'e-mail', `
    <p><b>De :</b> ${h(COMPTE_ENVOI)}<br><b>À :</b> ${h(m.a)}<br><b>Objet :</b> ${h(m.objet)}</p>
    <pre class="mail">${h(m.corps)}</pre>
    ${envoye ? `<p class="petit-texte">En production, cet e-mail part de la boîte ${h(COMPTE_ENVOI)}. <a href="${lienFormulaire(token)}" target="_blank">Ouvrir le formulaire comme le contact GIE</a></p>` : '<p class="petit-texte">Le texte se modifie dans Paramètres.</p>'}`);
}

export { pastille };
