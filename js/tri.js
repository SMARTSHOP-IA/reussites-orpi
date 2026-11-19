// Tri des tableaux : clic sur un en-tête = croissant, 2e clic = décroissant, 3e clic = ordre d'origine.
// S'applique automatiquement à tous les tableaux .table (page et panneau latéral).
// Exceptions : tableaux .sans-tri, tableaux avec lignes de total, et tableaux [data-tri-donnees]
// (Récompenses, Journal) qui trient eux-mêmes toutes leurs lignes, pages comprises.

const etats = new Map(); // clé de tableau -> { col, dir }
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function valeurCellule(td) {
  if (!td) return '';
  if (td.dataset.tri !== undefined) return td.dataset.tri;
  const champ = td.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
  if (champ) return champ.tagName === 'SELECT' ? (champ.selectedOptions[0]?.text || '') : champ.value;
  return td.textContent.replace(/\s+/g, ' ').trim();
}

function comparable(v) {
  const s = String(v).trim();
  if (!s || s === '—') return { vide: true };
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2}))?/);
  if (m) return { n: Number(`${m[3]}${m[2]}${m[1]}${m[4] || '00'}${m[5] || '00'}`) };
  m = s.replace(/[\s  ]/g, '').match(/^-?\d+(?:[.,]\d+)?$/);
  if (m) return { n: Number(m[0].replace(',', '.')) };
  return { t: s };
}

function comparer(a, b) {
  if (a.vide || b.vide) return a.vide && b.vide ? 0 : a.vide ? 1 : -1; // vides toujours en bas
  if (a.n !== undefined && b.n !== undefined) return a.n - b.n;
  return collator.compare(a.t ?? String(a.n), b.t ?? String(b.n));
}

function cle(table, index) {
  const vue = document.body.dataset.vue || location.hash.replace(/^#\/?/, '').split('?')[0];
  const zone = table.closest('#panneau') ? 'panneau' : 'page';
  const entetes = [...table.tHead.rows[0].cells].map(c => c.textContent.trim()).join('|');
  return `${vue}|${zone}|${index}|${entetes}`;
}

function appliquer(table, k) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const lignes = [...tbody.rows];
  if (!table._ordre) table._ordre = lignes;
  const etat = etats.get(k);
  const ths = [...table.tHead.rows[0].cells];
  ths.forEach((th, i) => { th.classList.toggle('tri-asc', etat?.col === i && etat.dir === 1); th.classList.toggle('tri-desc', etat?.col === i && etat.dir === -1); th.setAttribute('aria-sort', etat?.col === i ? (etat.dir === 1 ? 'ascending' : 'descending') : 'none'); });
  table.classList.toggle('trie', !!etat);
  let ordre;
  if (!etat) ordre = table._ordre.filter(tr => tr.parentNode === tbody);
  else {
    const fixes = lignes.filter(tr => tr.querySelector('td[colspan]'));
    const triables = lignes.filter(tr => !fixes.includes(tr));
    const vals = new Map(triables.map(tr => [tr, comparable(valeurCellule(tr.cells[etat.col]))]));
    ordre = [...triables].sort((a, b) => {
      const va = vals.get(a), vb = vals.get(b);
      if (va.vide || vb.vide) return comparer(va, vb);
      return comparer(va, vb) * etat.dir;
    }).concat(fixes);
  }
  ordre.forEach(tr => tbody.appendChild(tr));
}

function preparer(table, index) {
  if (table.dataset.triOk || table.classList.contains('sans-tri') || table.hasAttribute('data-tri-donnees')) return;
  if (!table.tHead?.rows[0] || table.querySelector('tr.total')) return;
  table.dataset.triOk = '1';
  const k = cle(table, index);
  [...table.tHead.rows[0].cells].forEach((th, i) => {
    if (!th.textContent.trim() || th.querySelector('input')) return;
    th.classList.add('triable');
    th.tabIndex = 0;
    th.title = 'Cliquer pour trier';
    const basculer = () => {
      const e = etats.get(k);
      if (!e || e.col !== i) etats.set(k, { col: i, dir: 1 });
      else if (e.dir === 1) etats.set(k, { col: i, dir: -1 });
      else etats.delete(k);
      appliquer(table, k);
    };
    th.addEventListener('click', basculer);
    th.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); basculer(); } });
  });
  if (etats.has(k)) appliquer(table, k);
}

function balayer() {
  document.querySelectorAll('#contenu, #panneau').forEach(zone => zone.querySelectorAll('table.table').forEach((t, i) => preparer(t, i)));
}

export function activerTris() {
  let attente = null;
  new MutationObserver(() => { cancelAnimationFrame(attente); attente = requestAnimationFrame(balayer); })
    .observe(document.body, { childList: true, subtree: true });
  balayer();
}

// Tri « données » pour les listes paginées : renvoie une fonction de comparaison.
export function comparateur(extraire, dir) {
  return (a, b) => {
    const va = comparable(extraire(a)), vb = comparable(extraire(b));
    if (va.vide || vb.vide) return comparer(va, vb);
    return comparer(va, vb) * dir;
  };
}
