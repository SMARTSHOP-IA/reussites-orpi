// Lecture / écriture de fichiers Excel (.xlsx) avec JSZip (chargé via vendor/jszip.min.js).
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colLettre(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function colIndex(lettres) {
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// feuilles : [{ nom, lignes: [[valeur|{v, style}]], largeurs: [nb caractères], entetes: nb lignes d'en-tête, figer: bool }]
// styles : 0 normal, 1 en-tête, 2 gras, 3 rouge clair, 4 orange clair, 5 jaune clair
export async function ecrireXlsx(feuilles) {
  const zip = new window.JSZip();
  const noms = feuilles.map((f, i) => (f.nom || `Feuille${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${noms.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${noms.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${noms.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F3A4A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDE2E1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFEFD6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7C2"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment wrapText="1" vertical="center"/></xf><xf xfId="0" fontId="2" applyFont="1"/><xf xfId="0" fillId="3" applyFill="1"/><xf xfId="0" fillId="4" applyFill="1"/><xf xfId="0" fillId="5" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  feuilles.forEach((f, i) => {
    const lignes = f.lignes.map((l, r) => {
      const cells = l.map((c, k) => {
        if (c === null || c === undefined || c === '') return '';
        const o = typeof c === 'object' && !(c instanceof Date) ? c : { v: c };
        const st = o.style ?? (r < (f.entetes ?? 1) ? 1 : 0);
        const ref = `${colLettre(k)}${r + 1}`;
        if (o.v === null || o.v === undefined || o.v === '') return st ? `<c r="${ref}" s="${st}"/>` : '';
        if (typeof o.v === 'number' && Number.isFinite(o.v)) return `<c r="${ref}" s="${st}"><v>${o.v}</v></c>`;
        return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    const cols = f.largeurs ? `<cols>${f.largeurs.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const fig = f.figer !== false && (f.entetes ?? 1) > 0 ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${f.entetes ?? 1}" topLeftCell="A${(f.entetes ?? 1) + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fig}${cols}<sheetData>${lignes}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

// Renvoie { nomFeuille: [[valeurs]] } (dans l'ordre du classeur).
export async function lireXlsx(fichier) {
  const zip = await window.JSZip.loadAsync(fichier);
  const parse = async p => new DOMParser().parseFromString(await zip.file(p).async('string'), 'application/xml');
  const wb = await parse('xl/workbook.xml');
  const rels = await parse('xl/_rels/workbook.xml.rels');
  const cibles = {};
  for (const r of rels.getElementsByTagName('Relationship')) cibles[r.getAttribute('Id')] = r.getAttribute('Target');
  let partages = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const ss = await parse('xl/sharedStrings.xml');
    partages = [...ss.getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  }
  const res = {};
  for (const s of wb.getElementsByTagName('sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let cible = cibles[rid];
    if (!cible) continue;
    cible = cible.replace(/^\/?xl\//, '').replace(/^\//, '');
    const doc = await parse(`xl/${cible}`);
    const lignes = [];
    for (const row of doc.getElementsByTagName('row')) {
      const l = [];
      for (const c of row.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || '';
        const k = colIndex(ref.replace(/\d+/g, ''));
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent;
        let val = '';
        if (t === 's') val = partages[Number(v)] ?? '';
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else if (t === 'b') val = v === '1';
        else if (t === 'str' || t === 'e') val = v ?? '';
        else val = v === undefined ? '' : Number(v);
        l[k] = val;
      }
      lignes[Number(row.getAttribute('r')) - 1] = Array.from(l, x => x ?? '');
    }
    res[s.getAttribute('name')] = Array.from(lignes, x => x ?? []);
  }
  return res;
}

export function lireCsv(texte) {
  const sep = (texte.split('\n')[0].match(/;/g) || []).length > (texte.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const lignes = [];
  let l = [], cell = '', guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') guillemets = false; else cell += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) { l.push(cell); cell = ''; } else if (c === '\n') { l.push(cell.replace(/\r$/, '')); lignes.push(l); l = []; cell = ''; } else cell += c;
  }
  if (cell || l.length) { l.push(cell); lignes.push(l); }
  return lignes;
}
