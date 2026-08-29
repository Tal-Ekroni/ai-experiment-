/** Builds a minimal Max-shaped .xlsx (inline strings, store method) with fake data — no
 *  personal info in the repo. Mirrors the real export: 3 junk rows, header row 4, DD-MM-YYYY. */
import { writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

function xmlEscape(s: string) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const rows: (string|number)[][] = [
  ['כל המשתמשים (1)'], ['1234-DEMO'], ['01/2026'],
  ['תאריך עסקה','שם בית העסק','קטגוריה','4 ספרות','סוג עסקה','סכום חיוב','מטבע חיוב'],
  ['24-07-2025','שופרסל דיל','מזון','1234','רגילה',320.5,'₪'],
  ['28-11-2025','עופר חברה לרכב בעמ','תחבורה','1234','תשלומים',1850,'₪'],
  ['01-12-2025','מסעדת הצפון בע"מ','מסעדות','1234','רגילה',189,'₪'],
  ['08-12-2025','ביטוח ישיר','ביטוח','1234','זיכוי',-119.61,'₪'],
];
const colRef = (c: number) => String.fromCharCode(65 + c);
const sheetRows = rows.map((r, ri) => {
  const cells = r.map((v, ci) => {
    const ref = `${colRef(ci)}${ri + 1}`;
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(v))}</t></is></c>`;
  }).join('');
  return `<row r="${ri + 1}">${cells}</row>`;
}).join('');
const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
const workbook = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="עסקאות" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const wbrels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const ctypes = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

// minimal ZIP writer, store method (no compression)
function zip(files: [string, string][]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + data.length;
  }
  const localBuf = Buffer.concat(local);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const buf = zip([
  ['[Content_Types].xml', ctypes], ['_rels/.rels', rels],
  ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', wbrels],
  ['xl/worksheets/sheet1.xml', sheet],
]);
writeFileSync(new URL('./fixtures/max-demo.xlsx', import.meta.url), buf);
console.log('wrote max-demo.xlsx', buf.length, 'bytes');
