import { MODE, EDITION_PAR_DEFAUT, API_URL } from './config.js';
import { store } from './store.js';
import { calculer } from './model.js';
import { h, toast, nombre, dateFr } from './ui.js';
import { LOGO } from './logo.js';

const ICONES = {"tableau": "<path d=\"M3 11.5 12 4l9 7.5\"/><path d=\"M5 10v10h5v-6h4v6h5V10\"/>", "recompenses": "<path d=\"M8 4h8v5a4 4 0 0 1-8 0z\"/><path d=\"M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4\"/><path d=\"M12 13v4M8 20h8M9.5 17h5\"/>", "annuaire": "<path d=\"M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z\"/><path d=\"M4 7h3M4 12h3M4 17h3\"/><circle cx=\"12.5\" cy=\"10\" r=\"2.3\"/><path d=\"M9 16a3.5 3.5 0 0 1 7 0\"/>", "gies": "<path d=\"M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2.3\"/>", "productions": "<path d=\"M3 20V10l5 3V10l5 3V7l8 4v9z\"/><path d=\"M3 20h18\"/>", "expeditions": "<path d=\"M3 7h11v9H3z\"/><path d=\"M14 10h4l3 3v3h-7\"/><circle cx=\"7\" cy=\"17.5\" r=\"1.8\"/><circle cx=\"17\" cy=\"17.5\" r=\"1.8\"/>", "diplomes": "<path d=\"M5 4h14v12H5z\"/><path d=\"M8 8h8M8 11h5\"/><path d=\"m10 16-1 5 3-2 3 2-1-5\"/>", "references": "<path d=\"M4 9h16M4 15h16M10 3 8 21M16 3l-2 18\"/>", "journal": "<path d=\"M6 3h12v18H6z\"/><path d=\"M9 8h6M9 12h6M9 16h4\"/>", "parametres": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z\"/>"};
const icone = k => `<span class="ico"><svg viewBox="0 0 24 24">${ICONES[k] || ''}</svg></span>`;

// Mode sombre : même réglage que les autres outils Smartshop (clé ss-theme)
function appliquerTheme(t, sauver) {
  document.documentElement.dataset.theme = t;
  const sw = document.getElementById('themeSw');
  if (sw) sw.checked = t === 'dark';
  if (sauver) { try { localStorage.setItem('ss-theme', t); } catch { /* ignore */ } }
}
(() => { let t = null; try { t = localStorage.getItem('ss-theme'); } catch { /* ignore */ } appliquerTheme(t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false); })();
import { utilisateurCourant, connexionDemo, connexionGoogle, envoyerLienConnexion, deconnexion, ROLES, jetonGoogle } from './auth.js';
import { session, synchroniser, lireFichierClientGoogle, verifierReponses } from './actions.js';
import { vueTableau } from './views/tableau.js';
import { vueRecompenses } from './views/recompenses.js';
import { vueGies } from './views/gies.js';
import { vueAnnuaire } from './views/annuaire.js';
import { vueProductions } from './views/productions.js';
import { vueExpeditions } from './views/expeditions.js';
import { vueReferences } from './views/references.js';
import { vueJournal } from './views/journal.js';
import { vueDiplomes } from './views/diplomes.js';
import { vueParametres } from './views/parametres.js';

const VUES = {
  tableau: { titre: 'Tableau de bord', icone: '◧', vue: vueTableau, roles: ['equipe', 'client'] },
  recompenses: { titre: 'Récompenses', icone: '★', vue: vueRecompenses, roles: ['equipe', 'client'] },
  gies: { titre: 'Régions & livraisons', icone: '⌂', vue: vueGies, roles: ['equipe', 'client'] },
  annuaire: { titre: 'Annuaire', icone: '@', vue: vueAnnuaire, roles: ['equipe', 'client'] },
  productions: { titre: 'Productions usine', icone: '⚙', vue: vueProductions, roles: ['equipe', 'usine'] },
  expeditions: { titre: 'Expéditions', icone: '➜', vue: vueExpeditions, roles: ['equipe', 'client'] },
  diplomes: { titre: 'Diplômes', icone: '✎', vue: vueDiplomes, roles: ['equipe'] },
  references: { titre: 'Références trophées', icone: '#', vue: vueReferences, roles: ['equipe'] },
  journal: { titre: 'Journal des modifications', icone: '☰', vue: vueJournal, roles: ['equipe', 'client'] },
  parametres: { titre: 'Paramètres', icone: '⚒', vue: vueParametres, roles: ['equipe'] },
};

const app = document.getElementById('app');
let M = null;
let user = null;

async function demarrer() {
  user = await utilisateurCourant();
  if (!user) return ecranConnexion();
  if (user.refuse) return ecranConnexion(`Le compte ${h(user.email)} n'a pas accès à l'outil. Demandez à l'équipe Smartshop de vous ajouter.`);
  session.user = user;
  app.innerHTML = '<div class="chargement">Chargement des données…</div>';
  const edition = sessionStorage.getItem('reussites:edition') || EDITION_PAR_DEFAUT;
  await store.init(edition, user.role);
  M = calculer(store.etat);
  let attente = null;
  store.surChangement(() => {
    clearTimeout(attente);
    attente = setTimeout(() => { M = calculer(store.etat); rendre(null); }, 30);
  });
  window.addEventListener('hashchange', rendre);
  rendre();
  if (user.role === 'equipe') verificationAuto();
}

function vueCourante() {
  const nom = location.hash.replace(/^#\/?/, '').split('?')[0];
  const permises = Object.entries(VUES).filter(([, v]) => v.roles.includes(user.role)).map(([k]) => k);
  return permises.includes(nom) ? nom : permises[0];
}

let vuePrecedente = null;
let premierRendu = true;
function rendre(ev) {
  const nom = vueCourante();
  if (nom !== vuePrecedente) { document.getElementById('panneau')?.remove(); vuePrecedente = nom; }
  const etat = store.etat;
  if (!document.getElementById('contenu')) coquille();
  document.querySelectorAll('nav a').forEach(a => { a.classList.toggle('actif', a.dataset.vue === nom); a.setAttribute('aria-current', a.dataset.vue === nom ? 'true' : 'false'); });
  majBandeau();
  const navigation = !!(ev && ev.type === 'hashchange') || premierRendu;
  premierRendu = false;
  const ctx = { etat, M, user, navigation, lecture: user.role !== 'equipe', aller: v => { location.hash = `#/${v}`; } };
  const contenu = document.getElementById('contenu');
  const y = contenu.scrollTop;
  VUES[nom].vue(contenu, ctx);
  contenu.scrollTop = y;
  document.title = `${VUES[nom].titre} – Réussites Orpi ${etat.parametres.edition}`;
}

function coquille() {
  const etat = store.etat;
  app.innerHTML = `
    <div class="coquille role-${user.role}">
      <aside class="menu" aria-label="Navigation principale">
        <div class="logo-wrap">${LOGO}</div>
        <div class="outil">Réussites Orpi <span>Édition ${h(etat.parametres.edition)}</span></div>
        <nav>${Object.entries(VUES).filter(([, v]) => v.roles.includes(user.role)).map(([k, v]) => `<a href="#/${k}" data-vue="${k}" class="nav-item">${icone(k)}<span class="lib">${v.titre}</span><span class="compteur" data-compteur="${k}"></span></a>`).join('')}</nav>
        <div class="spacer"></div>
        <div class="pied-menu">
          ${MODE === 'demo' ? '<div class="demo">Mode démo – données 2026</div>' : ''}
          <label class="theme-sw" title="Mode sombre"><input type="checkbox" id="themeSw" aria-label="Mode sombre"><span class="tr"><span class="kn"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></span><span class="lbl"></span></span><span class="tx">Mode sombre</span></label>
          <div class="user-chip"><span title="${h(user.email)}"><strong>${h(user.nom)}</strong><small>${h(ROLES[user.role])}</small></span><button class="btn petit" id="btn-deco" title="Se déconnecter">Sortir</button></div>
        </div>
      </aside>
      <main>
        <div id="bandeau"></div>
        <div id="contenu"></div>
      </main>
    </div>`;
  document.getElementById('btn-deco').onclick = async () => { await deconnexion(); location.reload(); };
  const sw = document.getElementById('themeSw');
  sw.checked = document.documentElement.dataset.theme === 'dark';
  sw.onchange = () => appliquerTheme(sw.checked ? 'dark' : 'light', true);
}

function majBandeau() {
  const b = document.getElementById('bandeau');
  if (!b) return;
  const p = store.etat.parametres;
  const s = M.stats;
  const c = (k, n, cl = '') => { const el = document.querySelector(`[data-compteur="${k}"]`); if (el) { el.textContent = n || ''; el.className = `compteur ${cl}`; } };
  c('recompenses', s.erreur + s.conflits, 'rouge');
  c('productions', user.role === 'equipe' ? s.a_produire + s.complement : Object.values(store.etat.lots).filter(l => l.statut === 'envoye').length, 'orange');
  c('gies', Object.values(store.etat.gies).filter(g => g.formulaire?.statut === 'repondu').length, 'bleu');
  if (user.role !== 'equipe') { b.innerHTML = ''; return; }
  const r = p.dernierResume;
  b.innerHTML = `<div class="bandeau-synchro">
    <span class="point ${p.derniereSynchro ? 'ok' : ''}"></span>
    <span>Fichier client : ${p.derniereSynchro ? `vérifié le ${dateFr(p.derniereSynchro, true)}${r ? ` — ${r.ajouts} ajout(s), ${r.modifications} modification(s), ${r.suppressions} suppression(s)` : ''}` : 'jamais synchronisé'}</span>
    <span class="espace"></span>
    ${s.erreur ? `<a href="#/recompenses?f=erreur" class="pastille rouge">${nombre(s.erreur)} incohérence(s) bloquante(s)</a>` : ''}
    ${s.conflits ? `<a href="#/recompenses?f=conflit" class="pastille rouge">${nombre(s.conflits)} conflit(s) à arbitrer</a>` : ''}
    <button class="btn petit" id="btn-synchro">${MODE === 'demo' ? 'Importer le fichier client' : 'Vérifier maintenant'}</button>
  </div>`;
  document.getElementById('btn-synchro').onclick = () => (MODE === 'demo' ? location.hash = '#/parametres?import=1' : verifier(true));
}

async function verifier(interactif) {
  try {
    const tableau = await lireFichierClientGoogle(interactif);
    if (!tableau) {
      if (!interactif) toast('Connectez-vous à Google pour vérifier le fichier client : bouton « Vérifier maintenant ».', 'info', 7000);
      return;
    }
    const r = await synchroniser(tableau);
    const n = r.ajouts + r.modifications + r.suppressions;
    toast(n ? `Fichier client : <b>${r.ajouts}</b> ajout(s), <b>${r.modifications}</b> modification(s), <b>${r.suppressions}</b> suppression(s) appliqués. <a href="#/journal">Voir le journal</a>` : 'Fichier client vérifié : aucun changement.', n ? 'info' : 'ok', n ? 10000 : 4000);
  } catch (e) {
    toast(`Vérification du fichier client impossible : ${h(e.message)}`, 'erreur', 9000);
  }
}

async function verificationAuto() {
  if (MODE !== 'demo' && API_URL) await verifier(false);
  else if (MODE !== 'demo') {
    const t = await jetonGoogle(false);
    if (t) await verifier(false);
    else toast('Pour vérifier automatiquement le fichier client, reconnectez Google : bouton « Vérifier maintenant » en haut.', 'info', 8000);
  }
  try {
    const n = await verifierReponses();
    if (n) toast(`${n} nouvelle(s) réponse(s) au formulaire de livraison. <a href="#/gies">Voir</a>`, 'info', 8000);
  } catch (e) { console.warn(e); }
}

function ecranConnexion(erreur = '') {
  app.innerHTML = `
    <div class="connexion">
      <div class="carte">
        <div class="logo-wrap">${LOGO}</div>
        <h1>Réussites Orpi</h1><p class="sous-titre">Trophées, productions et livraisons</p>
        ${erreur ? `<p class="alerte-texte">${erreur}</p>` : ''}
        ${MODE === 'demo' ? `
          <p>Mode démo : les données 2026 sont chargées dans ce navigateur. Choisissez un profil pour tester l'outil.</p>
          <div class="pile">
            <button class="btn principal" data-role="equipe">Entrer comme équipe Smartshop</button>
            <button class="btn" data-role="client">Entrer comme cliente (lecture seule)</button>
            <button class="btn" data-role="usine">Entrer comme Laser Style (usine)</button>
          </div>
          <details class="petit-texte"><summary>Charger un autre jeu de données (seed-2026.json)</summary>
            <input type="file" id="jeu" accept=".json"></details>` : `
          <button class="btn principal large" id="g">Se connecter avec Google</button>
          <p class="petit-texte">Équipe Smartshop : utilisez votre compte Google smartshop.fr.</p>
          <hr>
          <form id="lien" class="pile">
            <label>Cliente ou usine : recevoir un lien de connexion<input type="email" name="email" required placeholder="vous@exemple.fr"></label>
            <button class="btn">Recevoir le lien</button>
          </form>`}
      </div>
    </div>`;
  app.querySelectorAll('[data-role]').forEach(b => { b.onclick = async () => { await connexionDemo(b.dataset.role); location.hash = ''; demarrer(); }; });
  document.getElementById('jeu')?.addEventListener('change', async e => {
    try {
      const jeu = JSON.parse(await e.target.files[0].text());
      await store.importerJeuDemo('2026', jeu);
      toast('Jeu de données chargé : choisissez un profil.');
    } catch (err) { toast(h(err.message), 'erreur'); }
  });
  const g = document.getElementById('g');
  if (g) g.onclick = async () => { try { await connexionGoogle(); demarrer(); } catch (e) { toast(h(e.message), 'erreur'); } };
  const f = document.getElementById('lien');
  if (f) f.onsubmit = async ev => { ev.preventDefault(); try { await envoyerLienConnexion(f.email.value); toast('Lien envoyé : consultez votre boîte mail.'); } catch (e) { toast(h(e.message), 'erreur'); } };
}

demarrer().catch(e => { console.error(e); app.innerHTML = `<div class="connexion"><div class="carte"><p class="alerte-texte">Erreur au démarrage : ${h(e.message)}</p></div></div>`; });
