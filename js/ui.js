// Petits utilitaires d'interface.
export const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function dateFr(iso, avecHeure = false) {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return h(iso);
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('fr-FR', avecHeure ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export const nombre = n => (n ?? 0).toLocaleString('fr-FR');
export const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function metalChip(m) {
  return m ? `<span class="metal metal-${h(m.toLowerCase())}">${h(m)}</span>` : '<span class="metal">?</span>';
}
export function pastille(texte, classe = 'gris', titre = '') {
  return `<span class="pastille ${classe}" ${titre ? `title="${h(titre)}"` : ''}>${h(texte)}</span>`;
}

export function toast(msg, type = 'ok', duree = 4000) {
  let zone = document.getElementById('toasts');
  if (!zone) { zone = document.createElement('div'); zone.id = 'toasts'; document.body.appendChild(zone); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = msg;
  zone.appendChild(t);
  setTimeout(() => t.remove(), duree);
}

// Panneau latéral
export function panneau(titre, contenu, onBind) {
  fermerPanneau();
  const p = document.createElement('div');
  p.id = 'panneau';
  p.innerHTML = `<div class="voile"></div><aside><header><h2>${titre}</h2><button class="btn-icone fermer" aria-label="Fermer">✕</button></header><div class="corps">${contenu}</div></aside>`;
  document.body.appendChild(p);
  p.querySelector('.voile').onclick = fermerPanneau;
  p.querySelector('.fermer').onclick = fermerPanneau;
  onBind?.(p.querySelector('.corps'));
  return p;
}
export function fermerPanneau() { document.getElementById('panneau')?.remove(); }

export function modale(titre, contenu, boutons = [{ libelle: 'Fermer' }]) {
  return new Promise(res => {
    const m = document.createElement('div');
    m.className = 'modale';
    m.innerHTML = `<div class="boite"><h2>${titre}</h2><div class="contenu">${contenu}</div><footer>${boutons.map((b, i) => `<button class="btn ${b.classe || ''}" data-i="${i}">${h(b.libelle)}</button>`).join('')}</footer></div>`;
    document.body.appendChild(m);
    m.querySelectorAll('footer button').forEach(b => {
      b.onclick = () => { const i = Number(b.dataset.i); const v = boutons[i].valeur?.(m) ?? boutons[i].libelle; m.remove(); res(v); };
    });
  });
}
export async function confirmer(texte, libelleOk = 'Confirmer') {
  const r = await modale('Confirmation', `<p>${texte}</p>`, [{ libelle: 'Annuler', valeur: () => false }, { libelle: libelleOk, classe: 'principal', valeur: () => true }]);
  return r === true;
}

export function telecharger(nomFichier, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomFichier;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function selectHtml(nom, options, valeur, attrs = '') {
  return `<select name="${nom}" ${attrs}>${options.map(([v, l]) => `<option value="${h(v)}" ${String(v) === String(valeur ?? '') ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
}
