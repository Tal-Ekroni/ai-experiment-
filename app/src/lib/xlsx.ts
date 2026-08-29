/**
 * Minimal, zero-dependency .xlsx (OOXML) reader → string grid.
 * A .xlsx is a ZIP of XML. We read the ZIP central directory, inflate the sheet and
 * (if present) sharedStrings, and walk the cells into a dense row/column grid. No
 * third-party spreadsheet library touches this hostile input (stage-3 architecture).
 */
import { inflateRawSync } from 'node:zlib';

/** True if the buffer is a ZIP (and therefore a real .xlsx, not CSV or HTML-as-xls). */
export function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Read ZIP entries via the End Of Central Directory record. Handles store (0) and deflate (8). */
function readZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // locate EOCD (signature 0x06054b50), scanning from the end
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // start of central directory
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // local header: recompute data offset (name/extra lengths there can differ)
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
   .replace(/&amp;/g, '&');

const colToIndex = (ref: string) => {
  const m = ref.match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Parse the first worksheet into a dense grid of strings. */
export function parseXlsx(buf: Buffer): string[][] {
  const files = readZip(buf);
  // shared strings (optional — this Max export uses inline strings instead)
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) {
    const xml = ss.toString('utf8');
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
      shared.push(decodeXml(parts.map(t => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  // pick the first worksheet
  const sheetName = [...files.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort()[0];
  if (!sheetName) throw new Error('no worksheet in xlsx');
  const xml = files.get(sheetName)!.toString('utf8');

  const rows: string[][] = [];
  for (const rowXml of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    const cellRe = /<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>|<c\s+r="([A-Z]+\d+)"([^>]*)\/>/g;
    let m: RegExpExecArray | null;
    while ((m = cellRe.exec(rowXml)) !== null) {
      const ref = m[1] ?? m[4];
      const attrs = m[2] ?? m[5] ?? '';
      const body = m[3] ?? '';
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      let val = '';
      if (t === 's') {
        const idx = Number(/<v>(\d+)<\/v>/.exec(body)?.[1] ?? -1);
        val = shared[idx] ?? '';
      } else if (t === 'inlineStr') {
        val = decodeXml((body.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
          .map(x => x.replace(/<[^>]+>/g, '')).join(''));
      } else {
        const v = /<t[^>]*>([\s\S]*?)<\/t>|<v>([\s\S]*?)<\/v>/.exec(body);
        val = decodeXml((v?.[1] ?? v?.[2] ?? '').replace(/<[^>]+>/g, ''));
      }
      cells[colToIndex(ref)] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}
