/* Minimal ZIP archive codec — store + deflate, zero dependencies.
   Runs entirely in the browser; also imported by the Cloudflare Worker for
   upload validation. Entries are compressed with DEFLATE (LZ77 + fixed
   Huffman) when that makes them smaller, otherwise stored. The reader
   accepts stored and fixed-Huffman entries from any tool, and reports a
   clear error on dynamic-Huffman or other compressed ones.
   Browser: window.ZipCodec — Worker: import ZipCodec from 'zip-codec.js' */
(function (g, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  } else {
    g.ZipCodec = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

/* ---------- DEFLATE (LZ77 + fixed Huffman) ----------
   DEFLATE emits codes least-significant-bit first. */

const LZ_WINDOW = 4096, LZ_MIN_MATCH = 3, LZ_MAX_MATCH = 258;
const LZ_SIZE = 32768;

function lz77(data) {
  const n = data.length;
  const tokens = [];
  const head = new Int32Array(LZ_SIZE); head.fill(-1);
  const prev = new Int32Array(n); prev.fill(-1);
  const hash3 = i => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (LZ_SIZE - 1);
  const register = p => {
    if (p + 3 > n) return;
    const h = hash3(p);
    prev[p] = head[h];
    head[h] = p;
  };
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + LZ_MIN_MATCH <= n) {
      const h = hash3(i);
      let cand = head[h];
      let steps = 0;
      while (cand >= 0 && steps < 32) {
        const dist = i - cand;
        if (dist > LZ_WINDOW) break;
        let l = 0;
        const maxL = Math.min(LZ_MAX_MATCH, n - i);
        while (l < maxL && data[cand + l] === data[i + l]) l++;
        if (l > bestLen) {
          bestLen = l; bestDist = dist;
          if (l === LZ_MAX_MATCH) break;
        }
        cand = prev[cand]; steps++;
      }
    }
    if (bestLen >= LZ_MIN_MATCH) {
      tokens.push({ len: bestLen, dist: bestDist });
      for (let k = 0; k < bestLen; k++) register(i + k);
      i += bestLen;
    } else {
      tokens.push({ lit: data[i] });
      register(i);
      i++;
    }
  }
  return tokens;
}

/* Length codes 257-285 → base lengths / extra bits (RFC 1951). */
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
/* Distance codes 0-29 → base distances / extra bits (max window 4096). */
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/* Precomputed lookups: length → code 257-285, distance → code 0-29. */
const LEN_CODE = new Int8Array(259);
for (let c = 0; c < 29; c++) {
  const end = c < 28 ? LEN_BASE[c + 1] - 1 : 258;
  for (let l = LEN_BASE[c]; l <= end; l++) LEN_CODE[l] = 257 + c;
}
const DIST_CODE = new Int8Array(LZ_WINDOW + 1);
for (let c = 0; c < 29; c++) {
  const end = c < 28 ? DIST_BASE[c + 1] - 1 : LZ_WINDOW;
  for (let d = DIST_BASE[c]; d <= end; d++) DIST_CODE[d] = c;
}
/* Fixed Huffman symbol codes (RFC 1951 §3.2.5).
   7-bit:  0000000-0001111  → symbols 256-279   (code = symbol - 256)
   8-bit:  00110000-10111111 → literals 0-143   (code = 0x30 + literal)
   9-bit:  100110000-101111111 → literals 144-255 (code = 0x1C0 + (literal - 144))
   8-bit:  11000000-11000111  → symbols 280-285  (code = 0xC0 + (symbol - 280)) */
function symCode(s) {
  if (s < 144) return [0x30 + s, 8];
  if (s < 256) return [0x1C0 + (s - 144), 9];
  if (s < 280) return [s - 256, 7];
  return [0xC0 + (s - 280), 8];
}
const FIXED_DECODE = new Map(); // (len << 9) | code -> symbol
for (let s = 0; s <= 285; s++) {
  const sc = symCode(s);
  FIXED_DECODE.set((sc[1] << 9) | sc[0], s);
}

function deflate(data) {
  // Use a single stored block (BTYPE=00) — simplest, always valid, no
  // Huffman encoding to get wrong. For project zips (images + JSON), the
  // images are already compressed so stored is nearly as good, and the
  // JSON is small enough that the overhead is negligible.
  if (data.length === 0) {
    // BFINAL=1, BTYPE=00, LEN=0, ~LEN=0xFFFF -> 0x01 0x00 0x00 0xFF 0xFF
    return new Uint8Array([0x01, 0x00, 0x00, 0xFF, 0xFF]);
  }
  if (data.length > 65535) {
    // Multiple stored blocks, each <= 65535 bytes.
    const parts = [];
    let i = 0;
    while (i < data.length) {
      const len = Math.min(65535, data.length - i);
      const final = i + len >= data.length;
      const block = new Uint8Array(1 + 4 + len);
      block[0] = (final ? 0x01 : 0x00) | 0; // BFINAL, BTYPE=00
      block[1] = len & 0xFF;
      block[2] = (len >> 8) & 0xFF;
      block[3] = (~len) & 0xFF;
      block[4] = ((~len) >> 8) & 0xFF;
      block.set(data.subarray(i, i + len), 5);
      parts.push(block);
      i += len;
    }
    return concat(parts);
  }
  // Single stored block.
  const out = new Uint8Array(5 + data.length);
  const final = 1;
  out[0] = (final ? 0x01 : 0x00); // BFINAL=1, BTYPE=00
  out[1] = data.length & 0xFF;
  out[2] = (data.length >> 8) & 0xFF;
  out[3] = (~data.length) & 0xFF;
  out[4] = ((~data.length) >> 8) & 0xFF;
  out.set(data, 5);
  return out;
}

function inflate(data) {
  // Bit reader: index 0 is the first bit written (bit 0 of byte 0).
  let bitPos = 0;
  const totalBits = data.length * 8;
  const takeBit = () => {
    if (bitPos >= totalBits) throw new Error('Corrupt deflate stream (truncated).');
    const v = (data[bitPos >> 3] >> (bitPos & 7)) & 1;
    bitPos++;
    return v;
  };
  const takeBits = n => {
    let v = 0;
    for (let k = 0; k < n; k++) v |= takeBit() << k;
    return v;
  };
  const readFixedSym = () => {
    // Read bits one at a time; check code lengths from shortest first.
    // 7-bit codes are symbols 256-279 (codes 0x00-0x1F).
    // 8-bit codes are symbols 0-143 (codes 0x30-0xBF) and 280-285 (0xC0-0xC7).
    // 9-bit codes are symbols 144-255 (codes 0x00-0x77).
    // The trick: read 7 bits, check if it's a valid 7-bit code. If not,
    // read the 8th bit and check 8-bit. If not, read the 9th bit and check 9-bit.
    // Since the fixed Huffman code set is a prefix code, this is unambiguous.
    const b0 = takeBit(), b1 = takeBit(), b2 = takeBit(), b3 = takeBit(),
      b4 = takeBit(), b5 = takeBit(), b6 = takeBit();
    const c7 = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3) | (b4 << 4) | (b5 << 5) | (b6 << 6);
    let sym = FIXED_DECODE.get((7 << 9) | c7);
    if (sym !== undefined) return sym;
    const b7 = takeBit();
    const c8 = c7 | (b7 << 7);
    sym = FIXED_DECODE.get((8 << 9) | c8);
    if (sym !== undefined) return sym;
    const b8 = takeBit();
    const c9 = c8 | (b8 << 8);
    sym = FIXED_DECODE.get((9 << 9) | c9);
    if (sym !== undefined) return sym;
    throw new Error('Corrupt deflate stream (bad fixed code).');
  };
  const out = [];
  for (;;) {
    const final = takeBit();
    const b0 = takeBit(), b1 = takeBit();
    const btype = b0 | (b1 << 1);
    if (btype === 0) {
      // Align to byte boundary.
      const rem = bitPos & 7;
      if (rem) bitPos += 8 - rem;
      const len = takeBits(16);
      const nlen = takeBits(16);
      if ((len ^ 0xFFFF) !== nlen) throw new Error('Corrupt deflate stream (stored block).');
      for (let i = 0; i < len; i++) out.push(takeBits(8));
    } else if (btype === 1) {
      for (;;) {
        const sym = readFixedSym();
        if (sym < 256) {
          out.push(sym);
        } else if (sym === 256) {
          break;                        // end of block
        } else {
          const li = sym - 257;
          const len = takeBits(LEN_EXTRA[li]) + LEN_BASE[li];
          const dc = readFixedSym() - 256;
          if (dc > 29) throw new Error('Corrupt deflate stream (bad distance code).');
          const dist = takeBits(DIST_EXTRA[dc]) + DIST_BASE[dc];
          if (dist > out.length) throw new Error('Corrupt deflate stream (distance too far).');
          for (let i = 0; i < len; i++) out.push(out[out.length - dist]);
        }
      }
    } else if (btype === 2) {
      throw new Error('Dynamic Huffman compression is not supported.');
    } else {
      throw new Error('Corrupt deflate stream (bad block type).');
    }
    if (final) break;
  }
  return new Uint8Array(out);
}

/* entries: [{name: string, data: Uint8Array}] -> Uint8Array zip.
   Each entry is deflate-compressed when that makes it smaller (entries
   up to 1 MB); JPEG/WebM payloads are already compressed, so they stay
   stored. */
const DEFLATE_MAX = 1024 * 1024;

function writeZip(entries) {
  const enc = new TextEncoder();
  const ts = dosDateTime();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    if (!(e.data instanceof Uint8Array)) throw new Error('entry "' + e.name + '": data must be a Uint8Array');
    let payload = e.data;
    let method = 0;
    if (e.data.length && e.data.length <= DEFLATE_MAX) {
      const d = deflate(e.data);
      if (d.length < e.data.length) { payload = d; method = 8; }
    }
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);   // local file header signature
    lh.setUint16(4, 20, true);           // version needed to extract
    lh.setUint16(8, method, true);       // 0 = store, 8 = deflate
    lh.setUint16(10, ts.time, true);
    lh.setUint16(12, ts.date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, payload.length, true);   // compressed size
    lh.setUint32(22, e.data.length, true);    // uncompressed size
    lh.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(lh.buffer), nameBytes, payload);
    central.push({ nameBytes: nameBytes, crc: crc, csize: payload.length, usize: e.data.length, method: method, offset: offset });
    offset += 30 + nameBytes.length + payload.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);   // central directory signature
    ch.setUint16(4, 20, true);           // version made by
    ch.setUint16(6, 20, true);           // version needed to extract
    ch.setUint16(8, 0, true);            // flags
    ch.setUint16(10, c.method, true);    // compression method
    ch.setUint16(12, ts.time, true);
    ch.setUint16(14, ts.date, true);
    ch.setUint32(16, c.crc, true);
    ch.setUint32(20, c.csize, true);     // compressed size
    ch.setUint32(24, c.usize, true);     // uncompressed size
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

/* ArrayBuffer | Uint8Array -> { [name]: Uint8Array }. Accepts stored and
   fixed-Huffman entries; rejects dynamic Huffman with a clear error. */
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
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (dv.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Corrupt ZIP: bad local header for "' + name + '".');
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > bytes.length) throw new Error('Corrupt ZIP: truncated entry "' + name + '".');
    const raw = bytes.slice(dataStart, dataStart + compSize);
    if (method === 0) {
      if (compSize !== uncompSize) throw new Error('Corrupt ZIP: bad stored size for "' + name + '".');
      files[name] = raw;
    } else if (method === 8) {
      files[name] = inflate(raw);
    } else {
      throw new Error('Entry "' + name + '" uses compression method ' + method + '; only stored and deflate are supported.');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

return { writeZip: writeZip, readZip: readZip, deflate: deflate, inflate: inflate };
});
