import { h, toast, selectHtml, telecharger } from '../ui.js';
import { agir, pastille, badgeForm } from './commun.js';
import { majContact, importerContacts, CHAMPS_CONTACT, emailValide } from '../actions.js';
import { ouvrirGie } from './gies.js';
import { lireXlsx, lireCsv, ecrireXlsx } from '../xlsx.js';
import { norm } from '../logic.js';

// Annuaire des contacts GIE : mêmes données que la fiche « Régions & livraisons » (gie.contact).
const F = { texte: '', manque: '' };

const ALIAS = {
  code: ['gie', 'code gie', 'code', 'gie code', 'gie_code', 'region', 'n gie'],
  prenom: ['prenom', 'prénom', 'first name'],
  nom: ['nom', 'nom contact', 'last name'],
  fonction: ['fonction', 'poste', 'role'],
  tel: ['telephone', 'téléphone', 'tel', 'tél', 'mobile', 'portable', 'portable contact'],
  email: ['email', 'e mail', 'mail', 'adresse mail', 'adresse e mail', 'courriel'],
  cc: ['copie', 'cc', 'email copie', 'e mail en copie', 'mail copie'],
};

export function vueAnnuaire(root, ctx) {
  const { M, lecture } = ctx;
  const tous = M.giesTries;
  const sansEmail = tous.filter(g => !g.gie.contact?.email);
  const txt = norm(F.texte);
  const liste = tous.filter(g => {
    const c = g.gie.contact || {};
    if (F.manque === 'email' && c.email) return false;
    if (F.manque === 'tel' && c.tel) return false;
    if (F.manque === 'nom' && (c.nom || c.prenom)) return false;
    if (txt && !norm(`${g.code} ${g.gie.nom} ${c.prenom} ${c.nom} ${c.email} ${c.tel} ${c.fonction}`).includes(txt)) return false;
    return true;
  });
  const dis = lecture ? 'disabled' : '';
  const champ = (g, k, type = 'text', placeholder = '') => {
    const v = g.gie.contact?.[k] || '';
    const invalide = (k === 'email' || k === 'cc') && v && !emailValide(v);
    const manque = k === 'email' && !v;
    return `<input name="${k}" type="${type}" value="${h(v)}" ${dis} placeholder="${h(placeholder)}" class="${invalide ? 'invalide' : manque ? 'manquant' : ''}" data-gie="${g.code}">`;
  };

  root.innerHTML = `
    <header class="entete"><div><h1>Annuaire</h1>
      <p class="sous-titre">Contacts des GIE : nom et coordonnées. Les modifications s'enregistrent toutes seules et apparaissent dans la fiche du GIE (Régions & livraisons). L'e-mail sert à envoyer le formulaire de livraison.</p></div>
      <div class="pile-h">
        <button class="btn" id="export">Exporter en Excel</button>
        ${lecture ? '' : '<label class="btn principal" for="import-annuaire" style="flex-direction:row">Importer un fichier<input type="file" id="import-annuaire" accept=".xlsx,.csv" hidden></label>'}
      </div></header>
    <section class="tuiles">
      <a class="tuile"><span class="t">GIE</span><strong>${tous.length}</strong><small>dans l'annuaire</small></a>
      <a class="tuile ${sansEmail.length ? 'orange' : 'vert'}" href="#/annuaire" data-filtre="email"><span class="t">E-mails manquants</span><strong>${sansEmail.length}</strong><small>formulaire impossible à envoyer</small></a>
      <a class="tuile" data-filtre="tel"><span class="t">Téléphones manquants</span><strong>${tous.filter(g => !g.gie.contact?.tel).length}</strong><small>&nbsp;</small></a>
    </section>
    <div class="filtres">
      <input type="search" id="f-texte" placeholder="Rechercher un GIE, un nom, un e-mail…" value="${h(F.texte)}">
      ${selectHtml('manque', [['', 'Tous les contacts'], ['email', 'Sans e-mail'], ['tel', 'Sans téléphone'], ['nom', 'Sans nom']], F.manque, 'id="f-manque"')}
      <span class="petit-texte">${liste.length} GIE affiché(s)</span>
    </div>
    <div class="table-defile"><table class="table dense annuaire">
      <thead><tr><th>Prio.</th><th>GIE</th><th>Prénom</th><th>Nom</th><th>Fonction</th><th>Téléphone</th><th>E-mail</th><th>E-mail en copie</th><th>Formulaire</th><th></th></tr></thead>
      <tbody>${liste.map(g => `<tr data-gie="${g.code}">
        <td class="num">${g.gie.priorite || ''}</td>
        <td class="gie"><strong>${g.code}</strong> ${h(g.gie.nom)}<br><small>${g.total} trophée(s)</small></td>
        <td>${champ(g, 'prenom')}</td>
        <td>${champ(g, 'nom')}</td>
        <td>${champ(g, 'fonction')}</td>
        <td>${champ(g, 'tel', 'tel')}</td>
        <td>${champ(g, 'email', 'email', 'à compléter')}</td>
        <td>${champ(g, 'cc', 'email')}</td>
        <td>${badgeForm(g.gie.formulaire?.statut)}</td>
        <td><button class="btn petit lien" data-fiche="${g.code}">Fiche</button></td>
      </tr>`).join('') || '<tr><td colspan="10" class="vide">Aucun GIE ne correspond.</td></tr>'}</tbody>
    </table></div>
    ${lecture ? '' : `<p class="petit-texte">Import : fichier Excel ou CSV avec une colonne « GIE » (code, ex. 002) et une ou plusieurs colonnes parmi ${Object.values(CHAMPS_CONTACT).join(', ')}. Seules les cases remplies du fichier sont reprises ; les autres informations de l'annuaire sont conservées.</p>`}`;

  const maj = () => vueAnnuaire(root, ctx);
  let t;
  root.querySelector('#f-texte').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.texte = e.target.value; maj(); const v = root.querySelector('#f-texte'); v.focus(); v.setSelectionRange(v.value.length, v.value.length); }, 250); };
  root.querySelector('#f-manque').onchange = e => { F.manque = e.target.value; maj(); };
  root.querySelectorAll('[data-filtre]').forEach(a => { a.onclick = e => { e.preventDefault(); F.manque = a.dataset.filtre; maj(); }; });
  root.querySelectorAll('[data-fiche]').forEach(b => { b.onclick = () => ouvrirGie(ctx, b.dataset.fiche); });
  root.querySelector('#export').onclick = () => agir(async () => {
    const L = [['GIE', 'Nom GIE', ...Object.values(CHAMPS_CONTACT)], ...tous.map(g => [g.code, g.gie.nom, ...Object.keys(CHAMPS_CONTACT).map(k => g.gie.contact?.[k] || '')])];
    telecharger(`Reussites-Orpi-${ctx.etat.parametres.edition}-Annuaire.xlsx`, await ecrireXlsx([{ nom: 'Annuaire', lignes: L, largeurs: [7, 34, 16, 18, 20, 16, 32, 32] }]));
  });
  if (lecture) return;

  // Enregistrement à la sortie de chaque case
  root.querySelectorAll('input[data-gie]').forEach(inp => {
    inp.onchange = async () => {
      const n = await agir(() => majContact(inp.dataset.gie, { [inp.name]: inp.value }));
      if (n) { inp.classList.remove('manquant', 'invalide'); inp.classList.add('enregistre'); setTimeout(() => inp.classList.remove('enregistre'), 1200); }
      else if (n === undefined) inp.classList.add('invalide');
    };
  });

  root.querySelector('#import-annuaire')?.addEventListener('change', e => agir(async () => {
    const f = e.target.files[0];
    if (!f) return;
    let tableau;
    if (/\.csv$/i.test(f.name)) tableau = lireCsv(await f.text());
    else { const feuilles = await lireXlsx(f); tableau = Object.values(feuilles).find(t => t.some(l => l.some(c => String(c).trim()))) || []; }
    const iEntete = tableau.findIndex(l => l.some(c => ALIAS.code.includes(norm(c))));
    if (iEntete < 0) throw new Error('Colonne « GIE » introuvable dans le fichier');
    const entete = tableau[iEntete].map(c => norm(c));
    const pos = Object.fromEntries(Object.entries(ALIAS).map(([k, a]) => [k, entete.findIndex(x => a.map(norm).includes(x))]));
    const lignes = tableau.slice(iEntete + 1).map(l => Object.fromEntries(Object.entries(pos).filter(([, i]) => i >= 0).map(([k, i]) => [k, l[i]])))
      .filter(l => l.code !== undefined && String(l.code).trim());
    // « 002 - ORPI PARIS » → 002
    lignes.forEach(l => { l.code = String(l.code).trim().split(/\s*-\s*|\s+/)[0]; });
    const r = await importerContacts(lignes, f.name);
    toast(`Annuaire : <b>${r.maj}</b> GIE mis à jour.${r.inconnus.length ? ` GIE inconnus ignorés : ${h(r.inconnus.join(', '))}.` : ''}${r.invalides.length ? ` E-mails invalides ignorés : ${h(r.invalides.join(' ; '))}.` : ''}`, r.inconnus.length || r.invalides.length ? 'info' : 'ok', 10000);
    e.target.value = '';
  }));
}

export { pastille };
