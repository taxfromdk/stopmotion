/* Minimal ZIP archive codec — store method only, zero dependencies.
   Runs entirely in the browser; images/sounds are already compressed
   formats so no deflate is needed. The reader accepts stored entries from
   any tool and reports a clear error on compressed ones. */
(function (g) {
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  d = d || new Date();
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (((year - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* entries: [{name: string, data: Uint8Array}] -> Uint8Array zip */
function writeZip(entries) {
  const enc = new TextEncoder();
  const ts = dosDateTime();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    if (!(e.data instanceof Uint8Array)) throw new Error('entry "' + e.name + '": data must be a Uint8Array');
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);   // local file header signature
    lh.setUint16(4, 20, true);           // version needed to extract
    lh.setUint16(8, 0, true);            // compression: store
    lh.setUint16(10, ts.time, true);
    lh.setUint16(12, ts.date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, e.data.length, true);
    lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(lh.buffer), nameBytes, e.data);
    central.push({ nameBytes: nameBytes, crc: crc, size: e.data.length, offset: offset });
    offset += 30 + nameBytes.length + e.data.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);   // central directory signature
    ch.setUint16(4, 20, true);           // version made by
    ch.setUint16(6, 20, true);           // version needed to extract
    ch.setUint16(8, 0, true);            // flags
    ch.setUint16(10, 0, true);           // compression: store
    ch.setUint16(12, ts.time, true);
    ch.setUint16(14, ts.date, true);
    ch.setUint32(16, c.crc, true);
    ch.setUint32(20, c.size, true);      // compressed size (== stored)
    ch.setUint32(24, c.size, true);      // uncompressed size
    ch.setUint16(28, c.nameBytes.length, true);
    ch.setUint16(34, 0, true);           // disk number start
    ch.setUint32(38, 0, true);           // external attributes
    ch.setUint32(42, c.offset, true);    // local header offset
    parts.push(new Uint8Array(ch.buffer), c.nameBytes);
    offset += 46 + c.nameBytes.length;
  }
  const cdSize = offset - cdStart;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);   // end of central directory signature
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  parts.push(new Uint8Array(eocd.buffer));
  return concat(parts);
}

/* ArrayBuffer | Uint8Array -> { [name]: Uint8Array } */
function readZip(buf) {
  const bytes = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  if (bytes.length < 22) throw new Error('Not a ZIP file (too small).');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const minPos = Math.max(0, bytes.length - 22 - 65535); // allow up to a 64k comment
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (end-of-directory record not found).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP: bad central directory entry.');
    const method = dv.getUint16(p + 10, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('Entry "' + name + '" is compressed; only stored (uncompressed) ZIP entries are supported.');
    if (dv.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Corrupt ZIP: bad local header for "' + name + '".');
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + uncompSize > bytes.length) throw new Error('Corrupt ZIP: truncated entry "' + name + '".');
    files[name] = bytes.slice(dataStart, dataStart + uncompSize);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

g.ZipCodec = { writeZip: writeZip, readZip: readZip };
})(typeof window !== 'undefined' ? window : globalThis);
