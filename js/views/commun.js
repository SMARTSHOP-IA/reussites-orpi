import { h, toast, metalChip, pastille } from '../ui.js';
import { PROBLEMES } from '../logic.js';
import { ETATS_PROD, STATUTS_FORM, STATUTS_EXPE } from '../model.js';

export function paramHash(nom) {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q).get(nom);
}

export async function agir(fn, msgOk) {
  try {
    const r = await fn();
    if (msgOk) toast(msgOk);
    return r;
  } catch (e) {
    console.error(e);
    toast(h(e.message || String(e)), 'erreur', 8000);
    return undefined;
  }
}

export function badgesProblemes(codes) {
  return (codes || []).map(c => pastille(c === 'CODE_AGENCE' ? 'Code agence' : PROBLEMES[c]?.libelle.split(' :')[0].split('(')[0].trim() || c,
    PROBLEMES[c]?.niveau === 'erreur' ? 'rouge' : PROBLEMES[c]?.niveau === 'alerte' ? 'orange' : 'gris', PROBLEMES[c]?.libelle)).join(' ');
}

export function badgeProd(etat) {
  const p = ETATS_PROD[etat];
  return p ? pastille(p.libelle, p.classe) : '';
}

export function badgeForm(statut) {
  const cl = { a_envoyer: 'gris', envoye: 'bleu-clair', repondu: 'bleu', valide: 'vert' }[statut] || 'gris';
  return pastille(STATUTS_FORM[statut] || 'À envoyer', cl);
}

export function badgeExpe(statut) {
  const cl = { a_preparer: 'gris', expedie: 'bleu', livre: 'vert' }[statut] || 'gris';
  return pastille(STATUTS_EXPE[statut] || 'À préparer', cl);
}

export function compteMetaux(m) {
  return `<span class="metaux">${['Platine', 'Or', 'Argent', 'Bronze'].map(k => `<span class="mc metal-${k.toLowerCase()}" title="${k}">${m[k] || 0}</span>`).join('')}</span>`;
}

export function optionsGie(M, vide = 'Tous les GIE') {
  return [['', vide], ...M.giesTries.map(g => [g.code, `${g.code} – ${g.gie.nom}`])];
}

export { h, metalChip, pastille };
