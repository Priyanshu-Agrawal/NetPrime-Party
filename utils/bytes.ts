/** Bytes helpers shared by the plugin registry and the stream probe (no platform TextDecoder needed). */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

/** UTF-8 → string, or null for anything that isn't well-formed UTF-8 (overlong forms, surrogates, stray bytes). */
export function decodeUtf8Strict(b: Uint8Array): string | null {
  const units: number[] = [];
  let out = "";
  const flush = () => {
    out += String.fromCharCode(...units);
    units.length = 0;
  };
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp: number;
    let n: number;
    if (c < 0x80) [cp, n] = [c, 0];
    else if (c >= 0xc2 && c <= 0xdf) [cp, n] = [c & 0x1f, 1];
    else if (c >= 0xe0 && c <= 0xef) [cp, n] = [c & 0x0f, 2];
    else if (c >= 0xf0 && c <= 0xf4) [cp, n] = [c & 0x07, 3];
    else return null;
    for (let k = 1; k <= n; k++) {
      const cc = b[i + k];
      if (cc === undefined || (cc & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (cc & 0x3f);
    }
    if ((n === 2 && cp < 0x800) || (n === 3 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    if (cp > 0xffff) {
      cp -= 0x10000;
      units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else units.push(cp);
    if (units.length >= 8192) flush();
    i += n + 1;
  }
  flush();
  return out;
}
