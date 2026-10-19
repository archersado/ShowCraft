/**
 * Sec-MS-GEC v2 implementation ported from rany2/edge-tts 7.3.1.
 * The protocol is reverse engineered and may change with Microsoft's service;
 * handshake diagnostics tell operators to compare this file with upstream.
 */

export const EDGE_TTS_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const CHROMIUM_FULL_VERSION = "143.0.3650.75";

const MASK = 0xffff_ffffn;
const SHA_INITIAL = [
  0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an,
  0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n,
];
const SHA_STATE = [
  0xfd9fbea2n, 0x91243ce7n, 0xbe499094n, 0xcd2e1e0an,
  0x6c006f49n, 0x04bd35abn, 0xfeb0a7e4n, 0x03effbd2n,
];
const SHA_SCHEDULE = [
  0xeb24bf9en, 0x1558691fn, 0xa0c09ee2n, 0x0cfa32ban, 0xa622ee8cn,
  0xd1dd9491n, 0xc0dd25a0n, 0xf9e70ab6n, 0xf0c31573n, 0x7058ce4en,
  0x7188e606n, 0x00e5ab33n, 0xd258b060n, 0x72766564n,
];
const SHA_K = [
  0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n, 0xab1c5ed5n,
  0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen, 0x9bdc06a7n, 0xc19bf174n,
  0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn, 0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan,
  0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n, 0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n,
  0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn, 0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n,
  0xa2bfe8a1n, 0xa81a664bn, 0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n,
  0x19a4c116n, 0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
  0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan,
  0xa4506cebn, 0xbef9a3f7n, 0xc67178f2n,
];

const CS64_COEFFICIENTS = [
  [0xe82e91b1n, 0xb32700d0n], [0x44de24c6n, 0x88dff51dn],
  [0x3beb65bcn, 0x29514038n], [0xc89c5933n, 0xb328cbdfn],
  [0x8d1ec211n, 0xd405b4d5n], [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n], [0xf0a5b9d5n, 0x82b2c1fbn],
  [0x06064cf3n, 0xfa51a3dan], [0xda79fa60n, 0x207cc464n],
  [0xbed20560n, 0x3c3c74f3n], [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n], [0xcb49e3c6n, 0xc5626167n],
] as const;

const u32 = (value: bigint): bigint => value & MASK;
const rotr = (value: bigint, count: bigint): bigint =>
  u32((value >> count) | (value << (32n - count)));
const rol16 = (value: bigint): bigint => u32((value << 16n) | (value >> 16n));
const sigma0 = (value: bigint): bigint => u32(rotr(value, 7n) ^ rotr(value, 18n) ^ (value >> 3n));
const sigma1 = (value: bigint): bigint => u32(rotr(value, 17n) ^ rotr(value, 19n) ^ (value >> 10n));

function expandSchedule(words: bigint[], firstWord = 16): void {
  for (let index = firstWord; index < 64; index += 1) {
    words.push(u32(sigma1(words[index - 2]!) + words[index - 7]! + sigma0(words[index - 15]!) + words[index - 16]!));
  }
}

function rounds(state: readonly bigint[], words: readonly bigint[], firstRound = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = [...SHA_K];
  if (firstRound === 14) constants[14] = 0xc9dc06a7n;
  for (let index = firstRound; index < 64; index += 1) {
    const sum1 = rotr(e!, 6n) ^ rotr(e!, 11n) ^ rotr(e!, 25n);
    const choose = g! ^ (e! & (f! ^ g!));
    const t1 = u32(h! + sum1 + choose + constants[index]! + words[index]!);
    const sum0 = rotr(a!, 2n) ^ rotr(a!, 13n) ^ rotr(a!, 22n);
    const majority = (a! & b!) | (c! & (a! | b!));
    const t2 = u32(sum0 + majority);
    [a, b, c, d, e, f, g, h] = [u32(t1 + t2), a!, b!, c!, u32(d! + t1), e!, f!, g!];
  }
  return [a!, b!, c!, d!, e!, f!, g!, h!];
}

function readBigEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function shaInit(bytes: Uint8Array): bigint[] {
  const words = Array<bigint>(14).fill(0n);
  words.push(readBigEndian(bytes.subarray(0, 3)), readBigEndian(bytes.subarray(3, 7)));
  for (let index = 16; index < 30; index += 1) {
    let value = SHA_SCHEDULE[index - 16]!;
    if (index - 2 >= 14) value += index === 16 ? sigma1(words[index - 2]!) ^ 0x000b92c0n : sigma1(words[index - 2]!);
    if (index - 7 >= 14) value += words[index - 7]!;
    if (index - 15 >= 14) value += index === 29 ? sigma0(words[index - 15]!) ^ 0x059c0b80n : sigma0(words[index - 15]!);
    words.push(u32(value));
  }
  words.push(u32(sigma1(words[28]!) + words[23]! + sigma0(words[15]!) + words[14]! + 0xc9dc06a7n - SHA_K[14]!));
  expandSchedule(words, 31);
  const working = rounds(SHA_STATE, words, 14);
  return working.map((value, index) => u32(value + SHA_INITIAL[index]!));
}

function shaDigest(data: Uint8Array): Uint8Array {
  if (data.length < 7) throw new Error("Token salt must contain at least seven bytes");
  const length = 57 + data.length;
  const zeroCount = ((55 - length) % 64 + 64) % 64;
  const padded = new Uint8Array(data.length - 7 + 1 + zeroCount + 8);
  padded.set(data.subarray(7));
  padded[data.length - 7] = 0x80;
  new DataView(padded.buffer).setBigUint64(padded.length - 8, BigInt(length * 8), false);
  let state = shaInit(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const view = new DataView(padded.buffer, padded.byteOffset + offset, 64);
    const words = Array.from({ length: 16 }, (_, index) => BigInt(view.getUint32(index * 4, false)));
    expandSchedule(words);
    const working = rounds(state, words);
    state = working.map((value, index) => u32(value + state[index]!));
  }
  const result = new Uint8Array(32);
  const view = new DataView(result.buffer);
  state.forEach((value, index) => view.setUint32(index * 4, Number(value), false));
  return result;
}

function wordsLittleEndianEven(data: Uint8Array): bigint[] {
  const paddedLength = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  const view = new DataView(padded.buffer);
  const words = Array.from({ length: paddedLength / 4 }, (_, index) => BigInt(view.getUint32(index * 4, true)));
  if (words.length % 2 === 1) words.push(0n);
  return words;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [bigint, bigint] {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = BigInt(digestView.getUint32(0, true)) | 1n;
  const keyB = BigInt(digestView.getUint32(4, true)) | 1n;
  const factors = [u32(keyA * 0x82893933n), u32(keyB * 0x82893933n)];
  const terms: bigint[] = CS64_COEFFICIENTS.map(([coefficient], index) => u32(coefficient * factors[index % 2]!));
  const offsets: bigint[] = CS64_COEFFICIENTS.map(([, offset]) => offset);
  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1);
  wordsLittleEndianEven(prefixed).forEach((word, index) => {
    let term = word * (index % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (index % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (index === 0) {
      term += 0xf2f90b1an * factors[0]!;
      offset += 0x0b1a0000n;
    }
    terms.push(u32(term));
    offsets.push(u32(offset));
  });
  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index]!;
    const y = terms[index + 1]!;
    let t = rol16(u32(offsets[index]! + x));
    let q = u32(t * 0x76f50f34n);
    swapAcc += u32(rol16(q) * 0xc3efea97n + q);
    t = rol16(u32(offsets[index + 1]! + y));
    q = u32(t * 0x1881ce3cn);
    swapLast = u32(rol16(q) * 0x35bd1ec9n + q);
    swapAcc = u32(swapAcc + swapLast);
    state = u32(state * keyA + x);
    for (const factor of [0xcf98b111n, 0x87085b9fn, 0x12ceb96dn, 0x257e1d83n]) state = u32(rol16(state) * factor);
    acc += state;
    t = u32(state * keyB + y);
    t = u32(rol16(t) * 0xa27416f5n);
    t = u32(rol16(t) * 0xd38396ffn);
    state = u32(rol16(u32(rol16(t) * 0x7c932b89n)) * 0xbfa49f69n);
    acc = u32(acc + state);
  }
  return [swapLast ^ state, swapAcc ^ acc];
}

function hexadecimal(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function generateSecMsGecV2(unixTimestamp = Date.now() / 1000): string {
  if (!Number.isFinite(unixTimestamp) || unixTimestamp < 0) {
    throw new RangeError("Edge TTS timestamp must be a finite non-negative number");
  }
  const roundedSeconds = unixTimestamp + 11_644_473_600;
  const ticks = Math.round((roundedSeconds - (roundedSeconds % 300)) * 10_000_000);
  const data = new TextEncoder().encode(`${ticks}${EDGE_TTS_TRUSTED_TOKEN}`);
  const digest = shaDigest(data);
  const cs64Words = cs64Digest(data, digest);
  const cs64 = new Uint8Array(8);
  const view = new DataView(cs64.buffer);
  view.setUint32(0, Number(cs64Words[0]), true);
  view.setUint32(4, Number(cs64Words[1]), true);
  return `${hexadecimal(cs64)}-${hexadecimal(digest)}`;
}
