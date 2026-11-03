import { h, dateFr, selectHtml, toast, confirmer, modale } from '../ui.js';
import { agir, paramHash } from './commun.js';
import { majParametres, synchroniser, lireFichierClientGoogle, nouvelleEdition } from '../actions.js';
import { exporterTout } from '../exports.js';
import { lireXlsx, lireCsv } from '../xlsx.js';
import { store } from '../store.js';
import { MODE, DOMAINE_EQUIPE } from '../config.js';
import { ROLES } from '../auth.js';

let accesCache = null;

export function vueParametres(root, ctx) {
  const { etat } = ctx;
  const p = etat.parametres;
  root.innerHTML = `
    <header class="entete"><div><h1>Paramètres</h1><p class="sous-titre">Édition ${h(p.edition)}</p></div></header>
    <section class="carte" id="import"><h2>Fichier de résultats de la cliente</h2>
      <form id="f-sheet" class="grille-form">
        <label class="large">Lien du Google Sheet<input name="sheetUrl" value="${h(p.sheetUrl || '')}" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
        <label>Onglet à lire<input name="sheetOnglet" value="${h(p.sheetOnglet || '')}" placeholder="vide = 1er onglet"></label>
        <div class="pile-h large"><button class="btn principal" type="submit">Enregistrer</button>${MODE === 'demo' ? '' : '<button class="btn" type="button" id="verif">Vérifier maintenant</button>'}</div>
      </form>
      <p class="petit-texte">Dernière vérification : ${p.derniereSynchro ? dateFr(p.derniereSynchro, true) : 'jamais'}. À chaque ouverture de l'outil, le fichier est comparé à l'état actuel : les ajouts, modifications et suppressions sont appliqués et tracés dans le journal, sans écraser tes corrections manuelles.</p>
      <hr>
      <h3>Importer un fichier (Excel ou CSV)</h3>
      <p class="petit-texte">Solution de secours si le Google Sheet n'est pas accessible : télécharge-le en .xlsx et importe-le ici. Même traitement que la vérification automatique.</p>
      <div class="pile-h"><input type="file" id="fichier" accept=".xlsx,.csv"></div>
      ${MODE === 'demo' ? `<hr><h3>Tester la synchronisation (mode démo)</h3><p class="petit-texte">Simule une mise à jour du fichier par la cliente : 2 ajouts, 1 changement de métal sur un trophée déjà produit, 1 suppression et 1 nom corrigé différemment de ta correction (conflit).</p><button class="btn" id="simuler">Simuler des modifications de la cliente</button>` : ''}
    </section>
    <section class="carte"><h2>E-mails du formulaire de livraison</h2>
      <form id="f-mail" class="grille-form">
        <label class="large">Signature (expéditeur)<input name="expediteurNom" value="${h(p.expediteurNom || '')}"></label>
        <label class="large">Objet du 1er envoi<input name="mailObjet" value="${h(p.mailObjet || '')}"></label>
        <label class="large">Texte du 1er envoi<textarea name="mailCorps" rows="8">${h(p.mailCorps || '')}</textarea></label>
        <label class="large">Objet de la relance<input name="relanceObjet" value="${h(p.relanceObjet || '')}"></label>
        <label class="large">Texte de la relance<textarea name="relanceCorps" rows="7">${h(p.relanceCorps || '')}</textarea></label>
        <p class="petit-texte large">Champs disponibles : {prenom} {nom} {gie} {nb} (nombre de trophées) {lien} (lien du formulaire) {edition} {expediteur}</p>
        <div class="large"><button class="btn principal" type="submit">Enregistrer</button></div>
      </form>
    </section>
    <section class="carte"><h2>Accès</h2>
      <p class="petit-texte">Toute personne connectée avec un compte Google <b>@${h(DOMAINE_EQUIPE)}</b> a accès en modification. Ajoute ici la cliente (lecture seule, sans la vue usine) et Laser Style (vue usine uniquement).</p>
      <div id="acces">Chargement…</div>
      <form id="f-acces" class="pile-h"><input type="email" name="email" placeholder="adresse e-mail" required>${selectHtml('role', [['client', ROLES.client], ['usine', ROLES.usine]], 'client')}<button class="btn">Ajouter</button></form>
    </section>
    <section class="carte"><h2>Éditions</h2>
      <div class="pile-h"><label>Édition affichée <select id="ed"></select></label></div>
      <form id="f-ed" class="pile-h"><input name="annee" type="number" min="2026" max="2100" value="${Number(p.edition) + 1}"><button class="btn">Créer cette édition</button></form>
      <p class="petit-texte">Une nouvelle édition reprend les références trophées, les régions, contacts et adresses, et l'ordre de priorité. Les récompenses arrivent au premier import du nouveau fichier client.</p>
    </section>
    ${MODE === 'demo' ? '' : `<section class="carte"><h2>Charger le jeu de test 2026</h2>
      <p class="petit-texte">Pour tester l'outil en ligne avec les données 2026 : choisis le fichier <b>seed-2026.json</b> (fourni avec l'outil, il n'est pas publié sur le site car il contient les noms des lauréats). Les données sont chargées dans l'édition indiquée (à faire sur une édition vide).</p>
      <form id="f-jeu" class="pile-h"><input name="ed" value="2026" size="6"><input type="file" name="fichier" accept=".json" required><button class="btn">Charger</button></form></section>`}
    <section class="carte"><h2>Sauvegarde</h2>
      <button class="btn" id="tout">Exporter toutes les données en Excel</button>
      ${MODE === 'demo' ? '<button class="btn danger" id="reset">Réinitialiser les données de démo</button>' : ''}
    </section>`;

  const formEnreg = (id, champs) => {
    const f = root.querySelector(id);
    f.onsubmit = ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(f).entries()); agir(() => majParametres(Object.fromEntries(champs.map(c => [c, d[c]]))), 'Paramètres enregistrés'); };
  };
  formEnreg('#f-sheet', ['sheetUrl', 'sheetOnglet']);
  formEnreg('#f-mail', ['expediteurNom', 'mailObjet', 'mailCorps', 'relanceObjet', 'relanceCorps']);

  const resultat = r => toast(`Synchronisation (${h(r.origine)}) : <b>${r.ajouts}</b> ajout(s), <b>${r.modifications}</b> modification(s), <b>${r.suppressions}</b> suppression(s). <a href="#/journal">Voir le journal</a>`, 'info', 10000);
  root.querySelector('#verif')?.addEventListener('click', () => agir(async () => { const t = await lireFichierClientGoogle(true); if (t) resultat(await synchroniser(t)); }));
  root.querySelector('#fichier').onchange = e => agir(async () => {
    const f = e.target.files[0];
    if (!f) return;
    let tableau;
    if (/\.csv$/i.test(f.name)) tableau = lireCsv(await f.text());
    else {
      const feuilles = await lireXlsx(f);
      const noms = Object.keys(feuilles);
      let nom = noms.find(n => n === p.sheetOnglet) || noms[0];
      if (noms.length > 1 && !noms.includes(p.sheetOnglet)) {
        nom = await modale('Quel onglet importer ?', selectHtml('onglet', noms.map(n => [n, n]), nom), [{ libelle: 'Importer', classe: 'principal', valeur: m => m.querySelector('select').value }]);
      }
      tableau = feuilles[nom];
    }
    resultat(await synchroniser(tableau, `Fichier importé : ${f.name}`));
    e.target.value = '';
  });
  root.querySelector('#simuler')?.addEventListener('click', () => agir(async () => resultat(await synchroniser(simulation(etat), 'Simulation démo'))));

  // Accès
  const zoneAcces = root.querySelector('#acces');
  const afficherAcces = a => {
    accesCache = a;
    const liste = Object.entries(a);
    zoneAcces.innerHTML = liste.length ? `<table class="table dense"><tbody>${liste.map(([e, v]) => `<tr><td>${h(e)}</td><td>${h(ROLES[v.role] || v.role)}</td><td><button class="btn petit lien" data-retirer="${h(e)}">Retirer</button></td></tr>`).join('')}</tbody></table>` : '<p class="petit-texte">Aucun accès externe pour le moment.</p>';
    zoneAcces.querySelectorAll('[data-retirer]').forEach(b => { b.onclick = () => agir(async () => { await store.supprimerAcces(b.dataset.retirer); afficherAcces(await store.lireAcces()); }, 'Accès retiré'); });
  };
  if (accesCache) afficherAcces(accesCache);
  store.lireAcces().then(afficherAcces).catch(e => { zoneAcces.textContent = e.message; });
  root.querySelector('#f-acces').onsubmit = ev => {
    ev.preventDefault();
    const f = ev.target;
    agir(async () => { await store.ecrireAcces(f.email.value.trim().toLowerCase(), f.role.value); afficherAcces(await store.lireAcces()); f.reset(); }, 'Accès ajouté : la personne peut se connecter avec un lien envoyé par e-mail');
  };

  // Éditions
  store.listerEditions().then(eds => {
    const s = root.querySelector('#ed');
    s.innerHTML = eds.map(e => `<option ${e === p.edition ? 'selected' : ''}>${e}</option>`).join('');
    s.onchange = () => { sessionStorage.setItem('reussites:edition', s.value); location.hash = '#/tableau'; location.reload(); };
  });
  root.querySelector('#f-ed').onsubmit = async ev => {
    ev.preventDefault();
    const annee = ev.target.annee.value;
    if (!(await confirmer(`Créer l'édition ${h(annee)} à partir de l'édition ${h(p.edition)} ?`, 'Créer'))) return;
    agir(async () => { await nouvelleEdition(annee); sessionStorage.setItem('reussites:edition', annee); location.hash = '#/parametres'; location.reload(); });
  };
  root.querySelector('#f-jeu')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (!(await confirmer(`Charger le jeu de test dans l'édition ${h(f.ed.value)} ?`, 'Charger'))) return;
    agir(async () => {
      const jeu = JSON.parse(await f.fichier.files[0].text());
      const n = await store.importerJeu(f.ed.value, jeu);
      sessionStorage.setItem('reussites:edition', f.ed.value);
      toast(`${n} éléments chargés`);
      setTimeout(() => location.reload(), 1200);
    });
  });
  root.querySelector('#tout').onclick = () => agir(() => exporterTout(etat));
  root.querySelector('#reset')?.addEventListener('click', async () => {
    if (!(await confirmer('Effacer toutes les modifications faites en démo et recharger les données 2026 d\'origine ?', 'Réinitialiser'))) return;
    store.reinitialiserDemo(); sessionStorage.removeItem('reussites:edition'); location.hash = ''; location.reload();
  });
  if (paramHash('import')) root.querySelector('#import').scrollIntoView();
}

// Fabrique une version modifiée du fichier client pour tester la synchronisation.
function simulation(etat) {
  const src = Object.values(etat.lignes).filter(l => l.src && l.statut !== 'supprimee').map(l => ({ ...l.src }));
  const entete = ['gie_code', 'gie_nom', 'Code Agence', 'Nom Agence', 'titre_conseiller', 'Nom associé/Collaborateur', 'CA_totalHT', 'nb_uv', 'categorie', 'récompense'];
  const versLigne = s => [s.gie, s.gieNom, s.codeAgence, s.agence, s.civilite, s.nom, s.ca, s.uv, s.categorie, s.recompense];
  const iMetal = src.findIndex(s => s.recompense === 'Bronze' && s.nom && s.gie === '028');
  if (iMetal >= 0) src[iMetal].recompense = 'Argent';
  const corrigee = Object.values(etat.lignes).find(l => l.src && l.ovr?.nom && !l.conflits?.length && l.statut !== 'supprimee');
  if (corrigee) { const i = src.findIndex(s => s.nom === corrigee.src.nom && s.gie === corrigee.src.gie); if (i >= 0) src[i].nom = `${corrigee.src.nom}e`; }
  const iSupp = src.findIndex(s => s.gie === '120' && s.recompense === 'Or' && s.nom);
  if (iSupp >= 0) src.splice(iSupp, 1);
  src.push({ gie: '028', gieNom: 'ORPI LYON', codeAgence: '28001', agence: '028001 - Agence de démonstration', civilite: 'Madame', nom: 'NOUVELLE Lauréate', categorie: 'Conseiller en transaction', recompense: 'Or' });
  src.push({ gie: '131', gieNom: 'ORPI BRETAGNE PAYS DE LA LOIRE', codeAgence: '131050', agence: '131050 - Orpi Démo Nantes', civilite: '', nom: 'TEST Sans-Civilité', categorie: 'Conseiller en location', recompense: 'Bronze' });
  return [entete, ...src.map(versLigne)];
}
