// Tests du moteur : node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  comparer, appliquer, resoudreRef, indexRefs, detecterProblemes, numeroter, effectif, estActive, nettoyerSource, lireSource,
} from '../js/logic.js';

const cheminSeed = new URL('../data/seed-2026.json', import.meta.url);
if (!fs.existsSync(cheminSeed)) { console.log('seed-2026.json absent : tests ignorés'); process.exit(0); }
const seed = JSON.parse(fs.readFileSync(cheminSeed));
let n = 0;
const nouvelId = () => `T${++n}`;
const sourceDepuis = lignes => lignes.filter(l => l.src && l.statut !== 'supprimee').map((l, i) => ({ ...l.src, _ligne: i + 2 }));

test('aucun écart quand le fichier client est identique', () => {
  const d = comparer(seed.lignes, sourceDepuis(seed.lignes));
  assert.equal(d.ajouts.length, 0);
  assert.equal(d.suppressions.length, 0);
  assert.equal(d.modifications.length, 0);
});

test('ajout, suppression, changement de métal et correction de nom détectés', () => {
  const src = sourceDepuis(seed.lignes);
  const cible = src.findIndex(s => s.nom === 'DAGNEAUX ORIGNY Sophie');
  src[cible] = { ...src[cible], recompense: 'Or' };                       // changement de métal
  const supp = src.splice(10, 1)[0];                                       // suppression
  src.push(nettoyerSource({ gie: '002', gieNom: 'X', codeAgence: 2029, agence: '002029 - Antony Immo', civilite: 'Madame', nom: 'NOUVELLE Lauréate', categorie: 'Conseiller en transaction', recompense: 'Bronze' }, 9999));
  const coussot = seed.lignes.find(l => l.ovr?.nom === 'COUSSOT Aïsa');
  const ic = src.findIndex(s => s.nom === coussot.src.nom);
  src[ic] = { ...src[ic], nom: 'COUSSOT Aïda' };                           // le client corrige autrement → conflit
  const d = comparer(seed.lignes, src);
  assert.equal(d.ajouts.length, 1);
  assert.equal(d.suppressions.length, 1);
  assert.equal(d.modifications.length, 2);
  const { lignes, journal } = appliquer(seed.lignes, d, { maintenant: 'now', nouvelId });
  const modif = lignes.find(l => l.src?.nom === 'DAGNEAUX ORIGNY Sophie');
  assert.equal(modif.src.recompense, 'Or');
  const c = lignes.find(l => l.id === coussot.id);
  assert.equal(c.ovr.nom, 'COUSSOT Aïsa', 'la correction manuelle est conservée');
  assert.equal(c.conflits[0].champ, 'nom');
  assert.equal(journal.length, 4);
  assert.ok(lignes.find(l => l.src?.nom === supp.nom && l.statut === 'supprimee'));
});

test('la correction disparaît quand le client se met à jour', () => {
  const src = sourceDepuis(seed.lignes);
  const coussot = seed.lignes.find(l => l.ovr?.nom === 'COUSSOT Aïsa');
  const ic = src.findIndex(s => s.nom === coussot.src.nom);
  src[ic] = { ...src[ic], nom: 'COUSSOT Aïsa' };
  const d = comparer(seed.lignes, src);
  const { lignes } = appliquer(seed.lignes, d, { maintenant: 'now', nouvelId });
  const c = lignes.find(l => l.id === coussot.id);
  assert.equal(c.ovr.nom, undefined);
  assert.equal(c.conflits.length, 0);
});

test('références : civilité et numérotation', () => {
  const idx = indexRefs(seed.references);
  const l = { src: { recompense: 'Bronze', categorie: 'Conseiller en transaction', civilite: 'Madame' }, ovr: {} };
  assert.equal(resoudreRef(l, idx).refId, 'R002');
  l.src.civilite = '';
  assert.equal(resoudreRef(l, idx).probleme, 'CIV_MANQUANTE');
  const { num } = numeroter(seed.references, seed.parametres.ordreMetaux);
  assert.equal(num.R001, 1);
  assert.equal(num.R073, 73);
});

test('quantités 2026 cohérentes avec la répartition (2 074 trophées)', () => {
  const actives = seed.lignes.filter(estActive);
  assert.equal(actives.length, 2074);
  const parMetal = {};
  for (const l of actives) { const m = effectif(l).recompense; parMetal[m] = (parMetal[m] || 0) + 1; }
  assert.deepEqual(parMetal, { Platine: 179, Or: 903, Argent: 349, Bronze: 643 });
});

test('incohérences détectées', () => {
  const pb = detecterProblemes(seed.lignes, seed.references, seed.gies);
  const tous = [...pb.values()].flat();
  assert.ok(tous.includes('CODE_AGENCE'));
});

test('lecture d\'un tableau Google Sheets', () => {
  const t = [['Check Smartclic', 'gie_code', 'gie_nom', 'adresse', 'code_postal', 'ville', 'Code Agence', 'Nom Agence', 'titre_conseiller', 'Nom associé/Collaborateur', 'CA_totalHT', 'nb_uv', 'categorie', 'récompense'],
    [false, '112.0', 'ORPI DROME', '', '', '', 2029, '002029 - Antony', 'Madame', 'X Y', 1000, 2, 'Conseiller en transaction', 'Or']];
  const { lignes, erreurs } = lireSource(t);
  assert.equal(erreurs.length, 0);
  assert.equal(lignes[0].gie, '112');
  assert.equal(lignes[0].gieBrut, '112.0');
});
