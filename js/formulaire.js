// Formulaire public envoyé aux contacts GIE : date de livraison, adresse(s), contact sur place.
import { MODE } from './config.js';
import { store, implFormulaireFirestore } from './store.js';
import { h, toast } from './ui.js';

const zone = document.getElementById('form');
const token = new URLSearchParams(location.search).get('t');

function decouper(texte) {
  const l = String(texte || '').split('\n').map(x => x.trim()).filter(Boolean).filter(x => !/^(0|\+)\d[\d\s.]{7,}$/.test(x));
  const iCp = l.findIndex(x => /\b\d{2}\s?\d{3}\b/.test(x));
  const r = { societe: l[0] || '', adresse: '', cp: '', ville: '' };
  if (iCp > 0) {
    const m = l[iCp].match(/\b(\d{2}\s?\d{3})\b\s*(.*)/);
    r.cp = m[1].replace(/\s/g, ''); r.ville = m[2].replace(/\(.*\)/, '').trim();
    r.adresse = l.slice(1, iCp).join(', ');
  } else r.adresse = l.slice(1).join(', ');
  return r;
}

async function demarrer() {
  if (!token) { zone.innerHTML = '<p class="alerte-texte">Lien incomplet. Utilisez le lien reçu par e-mail.</p>'; return; }
  const impl = MODE === 'demo' ? store : await implFormulaireFirestore();
  const f = await impl.lireFormulaire(token);
  if (!f) { zone.innerHTML = '<p class="alerte-texte">Ce formulaire est introuvable ou a expiré. Contactez Smartshop.</p>'; return; }
  const r = f.reponse || {};
  const valide = f.statut === 'valide';
  const dis = valide ? 'disabled' : '';
  const adr = [0, 1].map(i => ({ libelle: f.adresses?.[i]?.libelle || (i ? 'Adresse 2' : 'Adresse de livraison'), ...decouper(f.adresses?.[i]?.texte), contact: f.adresses?.[i]?.contactSurPlace || '', tel: f.adresses?.[i]?.tel || '', email: '', ...(r.adresses?.[i] || {}) }));
  const deux = (r.adresses?.length || f.adresses?.length || 1) > 1;
  const blocAdresse = (a, i) => `<fieldset class="adresse ${i && !deux ? 'cache' : ''}" data-i="${i}"><legend>${i ? 'Deuxième adresse' : 'Adresse de livraison'}</legend>
    <div class="grille-form">
      ${i ? `<label class="large">Nom de ce point de livraison<input name="a${i}_libelle" value="${h(a.libelle)}" ${dis}></label>` : `<input type="hidden" name="a0_libelle" value="${h(a.libelle)}">`}
      <label class="large">Agence / société<input name="a${i}_societe" value="${h(a.societe)}" ${dis} ${i ? '' : 'required'}></label>
      <label class="large">Adresse<input name="a${i}_adresse" value="${h(a.adresse)}" ${dis} ${i ? '' : 'required'}></label>
      <label>Code postal<input name="a${i}_cp" value="${h(a.cp)}" ${dis} ${i ? '' : 'required'} inputmode="numeric"></label>
      <label>Ville<input name="a${i}_ville" value="${h(a.ville)}" ${dis} ${i ? '' : 'required'}></label>
      <label>Contact sur place<input name="a${i}_contact" value="${h(a.contact)}" ${dis} ${i ? '' : 'required'} placeholder="Prénom Nom"></label>
      <label>Téléphone<input name="a${i}_tel" value="${h(a.tel)}" ${dis} ${i ? '' : 'required'} inputmode="tel"></label>
      <label class="large">E-mail du contact <small>(facultatif)</small><input name="a${i}_email" type="email" value="${h(a.email)}" ${dis}></label>
    </div></fieldset>`;

  zone.innerHTML = `
    <header class="entete-form"><span class="logo">R</span><div><h1>Réussites Orpi ${h(f.edition)}</h1><p>${h(f.gie)} – ${h(f.gieNom)} · <strong>${f.nb} trophées</strong> à livrer en une seule fois</p></div></header>
    ${valide ? '<div class="encart vert">Ces informations ont été validées par Smartshop. Pour toute modification, répondez directement à l\'e-mail reçu.</div>' : f.statut === 'repondu' ? '<div class="encart bleu">Merci, votre réponse a bien été reçue. Vous pouvez encore la modifier ci-dessous.</div>' : '<p>Merci d\'indiquer la date de livraison souhaitée, l\'adresse de livraison et la personne qui réceptionnera les trophées.</p>'}
    <form id="f" class="pile">
      <label class="date">Date de livraison souhaitée<input type="date" name="date" value="${h(r.date || f.dateSouhaitee || '')}" required ${dis}></label>
      ${blocAdresse(adr[0], 0)}
      <label class="case"><input type="checkbox" id="deux" ${deux ? 'checked' : ''} ${dis}> Livrer les trophées à deux adresses différentes</label>
      ${blocAdresse(adr[1], 1)}
      <fieldset id="repartition" class="${deux ? '' : 'cache'}"><legend>Quels trophées livrer à quelle adresse ?</legend>
        <table class="table dense"><thead><tr><th>Agence</th><th class="num">Trophées</th><th>Adresse 1</th><th>Adresse 2</th></tr></thead><tbody>
        ${(f.agences || []).map(a => { const v = String(r.affectations?.[a.cle] ?? ''); return `<tr><td>${h(a.agence)}</td><td class="num">${a.nb}</td><td><input type="radio" name="ag_${h(a.cle)}" value="0" ${v === '0' ? 'checked' : ''} ${dis}></td><td><input type="radio" name="ag_${h(a.cle)}" value="1" ${v === '1' ? 'checked' : ''} ${dis}></td></tr>`; }).join('')}
        </tbody></table></fieldset>
      <label>Commentaire <small>(horaires de réception, accès…)</small><textarea name="commentaire" rows="3" ${dis}>${h(r.commentaire || '')}</textarea></label>
      ${valide ? '' : '<button class="btn principal large" type="submit">Envoyer mes informations</button>'}
    </form>`;

  const form = zone.querySelector('#f');
  const caseDeux = zone.querySelector('#deux');
  caseDeux.onchange = () => {
    zone.querySelector('fieldset[data-i="1"]').classList.toggle('cache', !caseDeux.checked);
    zone.querySelector('#repartition').classList.toggle('cache', !caseDeux.checked);
    zone.querySelectorAll('fieldset[data-i="1"] input').forEach(i => { if (['a1_societe', 'a1_adresse', 'a1_cp', 'a1_ville', 'a1_contact', 'a1_tel'].includes(i.name)) i.required = caseDeux.checked; });
  };
  caseDeux.onchange();
  form.onsubmit = async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const n = caseDeux.checked ? 2 : 1;
    const adresses = Array.from({ length: n }, (_, i) => ({ libelle: d[`a${i}_libelle`] || (i ? 'Adresse 2' : 'Adresse de livraison'), societe: d[`a${i}_societe`], adresse: d[`a${i}_adresse`], cp: d[`a${i}_cp`], ville: d[`a${i}_ville`], contact: d[`a${i}_contact`], tel: d[`a${i}_tel`], email: d[`a${i}_email`] || '' }));
    let affectations = null;
    if (n === 2) {
      affectations = {};
      const manquantes = [];
      for (const a of f.agences || []) {
        const v = d[`ag_${a.cle}`];
        if (v === undefined) manquantes.push(a.agence); else affectations[a.cle] = Number(v);
      }
      if (manquantes.length) { toast(`Choisissez l'adresse pour : ${h(manquantes.join(', '))}`, 'erreur', 8000); return; }
    }
    try {
      await impl.repondreFormulaire(token, { date: d.date, adresses, affectations, commentaire: d.commentaire || '' });
      zone.innerHTML = `<header class="entete-form"><span class="logo">R</span><div><h1>Merci !</h1><p>Vos informations de livraison pour ${h(f.gieNom)} ont bien été transmises à Smartshop.</p></div></header><p>Vous pouvez rouvrir ce lien pour les modifier tant qu'elles n'ont pas été validées.</p>`;
    } catch (e) {
      toast(`Envoi impossible : ${h(e.message)}`, 'erreur', 8000);
    }
  };
}

demarrer().catch(e => { zone.innerHTML = `<p class="alerte-texte">Erreur : ${h(e.message)}</p>`; });
