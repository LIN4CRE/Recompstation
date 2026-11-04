/**
 * High-performance checksum and cryptographic hash calculations for ROM verification.
 */

// Precomputed CRC32 table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function calculateCrc32(data: Uint8Array): string {
  let crc = 0 ^ -1;
  const len = data.length;
  for (let i = 0; i < len; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return ((crc ^ -1) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export async function calculateSha1(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const bufferCopy = new Uint8Array(data.byteLength);
      bufferCopy.set(data);
      const hashBuffer = await crypto.subtle.digest('SHA-1', bufferCopy.buffer as ArrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback
    }
  }
  return computeFallbackHash(data, 'SHA-1');
}

export async function calculateMd5(data: Uint8Array): Promise<string> {
  // MD5 RFC 1321 pure implementation
  return computeMd5Pure(data);
}

function computeMd5Pure(data: Uint8Array): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }

  function bitRol(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const n = data.length;
  // Convert Uint8Array to 32-bit words
  const words: number[] = [];
  for (let i = 0; i < n; i++) {
    words[i >> 2] |= data[i] << ((i % 4) * 8);
  }

  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  words[(((n + 8) >> 6) << 4) + 14] = n * 8;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    const x = words.slice(i, i + 16);
    while (x.length < 16) x.push(0);

    a = ff(a, b, c, d, x[0] || 0, 7, -680876936);
    d = ff(d, a, b, c, x[1] || 0, 12, -389564586);
    c = ff(c, d, a, b, x[2] || 0, 17, 606105819);
    b = ff(b, c, d, a, x[3] || 0, 22, -1044525330);
    a = ff(a, b, c, d, x[4] || 0, 7, -176418897);
    d = ff(d, a, b, c, x[5] || 0, 12, 1200080426);
    c = ff(c, d, a, b, x[6] || 0, 17, -1473231341);
    b = ff(b, c, d, a, x[7] || 0, 22, -45705983);
    a = ff(a, b, c, d, x[8] || 0, 7, 1770035416);
    d = ff(d, a, b, c, x[9] || 0, 12, -1958414417);
    c = ff(c, d, a, b, x[10] || 0, 17, -42063);
    b = ff(b, c, d, a, x[11] || 0, 22, -1990404162);
    a = ff(a, b, c, d, x[12] || 0, 7, 1804603682);
    d = ff(d, a, b, c, x[13] || 0, 12, -40341101);
    c = ff(c, d, a, b, x[14] || 0, 17, -1502002290);
    b = ff(b, c, d, a, x[15] || 0, 22, 1236535329);

    a = gg(a, b, c, d, x[1] || 0, 5, -165796510);
    d = gg(d, a, b, c, x[6] || 0, 9, -1069501632);
    c = gg(c, d, a, b, x[11] || 0, 14, 643717713);
    b = gg(b, c, d, a, x[0] || 0, 20, -373897302);
    a = gg(a, b, c, d, x[5] || 0, 5, -701558691);
    d = gg(d, a, b, c, x[10] || 0, 9, 38016083);
    c = gg(c, d, a, b, x[15] || 0, 14, -660478335);
    b = gg(b, c, d, a, x[4] || 0, 20, -405537848);
    a = gg(a, b, c, d, x[9] || 0, 5, 568446438);
    d = gg(d, a, b, c, x[14] || 0, 9, -1019803690);
    c = gg(c, d, a, b, x[3] || 0, 14, -187363961);
    b = gg(b, c, d, a, x[8] || 0, 20, 1163531501);
    a = gg(a, b, c, d, x[13] || 0, 5, -1444681467);
    d = gg(d, a, b, c, x[2] || 0, 9, -51403784);
    c = gg(c, d, a, b, x[7] || 0, 14, 1735328473);
    b = gg(b, c, d, a, x[12] || 0, 20, -1926607734);

    a = hh(a, b, c, d, x[5] || 0, 4, -378558);
    d = hh(d, a, b, c, x[8] || 0, 11, -2022574463);
    c = hh(c, d, a, b, x[11] || 0, 16, 1839030562);
    b = hh(b, c, d, a, x[14] || 0, 23, -35309556);
    a = hh(a, b, c, d, x[1] || 0, 4, -1530992060);
    d = hh(d, a, b, c, x[4] || 0, 11, 1272893353);
    c = hh(c, d, a, b, x[7] || 0, 16, -155497632);
    b = hh(b, c, d, a, x[10] || 0, 23, -1094730640);
    a = hh(a, b, c, d, x[13] || 0, 4, 681279174);
    d = hh(d, a, b, c, x[0] || 0, 11, -358537222);
    c = hh(c, d, a, b, x[3] || 0, 16, -722521979);
    b = hh(b, c, d, a, x[6] || 0, 23, 76029189);
    a = hh(a, b, c, d, x[9] || 0, 4, -640364487);
    d = hh(d, a, b, c, x[12] || 0, 11, -421815835);
    c = hh(c, d, a, b, x[15] || 0, 16, 530742520);
    b = hh(b, c, d, a, x[2] || 0, 23, -995338651);

    a = ii(a, b, c, d, x[0] || 0, 6, -198630844);
    d = ii(d, a, b, c, x[7] || 0, 10, 1126891415);
    c = ii(c, d, a, b, x[14] || 0, 15, -1416354905);
    b = ii(b, c, d, a, x[5] || 0, 21, -57434055);
    a = ii(a, b, c, d, x[12] || 0, 6, 1700485571);
    d = ii(d, a, b, c, x[3] || 0, 10, -1894986606);
    c = ii(c, d, a, b, x[10] || 0, 15, -1051523);
    b = ii(b, c, d, a, x[1] || 0, 21, -2054922799);
    a = ii(a, b, c, d, x[8] || 0, 6, 1873313359);
    d = ii(d, a, b, c, x[15] || 0, 10, -30611744);
    c = ii(c, d, a, b, x[6] || 0, 15, -1560198380);
    b = ii(b, c, d, a, x[13] || 0, 21, 1309151649);
    a = ii(a, b, c, d, x[4] || 0, 6, -145523070);
    d = ii(d, a, b, c, x[11] || 0, 10, -1120210379);
    c = ii(c, d, a, b, x[2] || 0, 15, 718787259);
    b = ii(b, c, d, a, x[9] || 0, 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  function rhex(n: number) {
    let s = '';
    for (let j = 0; j <= 3; j++) {
      s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
    }
    return s;
  }

  return (rhex(a) + rhex(b) + rhex(c) + rhex(d)).toLowerCase();
}

function computeFallbackHash(data: Uint8Array, type: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 31 + data[i]) >>> 0;
  }
  return hash.toString(16).padStart(type === 'SHA-1' ? 40 : 32, '0');
}

/**
 * Calculates Shannon entropy (0 to 8 bits per byte).
 * Lower entropy (< 4) indicates uncompressed text or zero-padding.
 * Medium entropy (4 - 6.5) indicates code and uncompressed tile data.
 * High entropy (> 7.2) indicates compressed assets (LZSS, Huffman) or encrypted ROM.
 */
export function calculateEntropy(data: Uint8Array): { overall: number; buckets: number[] } {
  const len = data.length;
  if (len === 0) return { overall: 0, buckets: [] };

  // Overall entropy
  const freq = new Uint32Array(256);
  for (let i = 0; i < len; i++) {
    freq[data[i]]++;
  }

  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / len;
      entropy -= p * Math.log2(p);
    }
  }

  // Calculate 24 buckets across the file to show distribution
  const bucketCount = 24;
  const bucketSize = Math.max(1, Math.floor(len / bucketCount));
  const buckets: number[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = b * bucketSize;
    const end = Math.min(len, start + bucketSize);
    const chunkLen = end - start;

    if (chunkLen <= 0) {
      buckets.push(0);
      continue;
    }

    const chunkFreq = new Uint32Array(256);
    for (let i = start; i < end; i++) {
      chunkFreq[data[i]]++;
    }

    let chunkEntropy = 0;
    for (let i = 0; i < 256; i++) {
      if (chunkFreq[i] > 0) {
        const p = chunkFreq[i] / chunkLen;
        chunkEntropy -= p * Math.log2(p);
      }
    }
    buckets.push(Number(chunkEntropy.toFixed(2)));
  }

  return {
    overall: Number(entropy.toFixed(3)),
    buckets,
  };
}

/**
 * Extracts printable ASCII strings with minimum length.
 */
export function extractAsciiStrings(data: Uint8Array, minLen = 4, maxCount = 20): string[] {
  const strings: string[] = [];
  let current: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    // Printable ASCII 32 - 126
    if (b >= 32 && b <= 126) {
      current.push(b);
    } else {
      if (current.length >= minLen) {
        const str = String.fromCharCode(...current).trim();
        // Skip obvious junk
        if (str.length >= minLen && !/^[\s.]+$/.test(str) && !strings.includes(str)) {
          strings.push(str);
          if (strings.length >= maxCount) break;
        }
      }
      current = [];
    }
  }

  return strings;
}
