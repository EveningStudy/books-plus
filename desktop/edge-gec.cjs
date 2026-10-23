// Adapted from node-edge-tts src/drm.ts (MIT), retrieved 2026-10-23.
// https://github.com/SchneeHertz/node-edge-tts/blob/master/src/drm.ts
// Copyright (c) 2022 SchneeHertz. See licenses/node-edge-tts-LICENSE.txt.
const { createHash } = require("node:crypto");
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const SEC_MS_GEC_VERSION_V2 = `2-${CHROMIUM_FULL_VERSION}`;
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WINDOWS_FILE_TIME_EPOCH = 11644473600n;

// 固定前缀使用 Base64 分段存储
const PREFIX = Buffer.from(
  [
    "Q29weXJpZ2h0IChDKSBNaWNyb3NvZnQg",
    "Q29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQu",
  ].join(""),
  "base64",
);

const COEFFICIENTS = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];

const mul = Math.imul;

const rol16 = (x) => ((x << 16) | (x >>> 16)) >>> 0;

function cs64Digest(data, shaDigest) {
  const keyA = (shaDigest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (shaDigest.readUInt32LE(4) | 1) >>> 0;

  const factors = [mul(keyA, 0x82893933) >>> 0, mul(keyB, 0x82893933) >>> 0];

  const terms = COEFFICIENTS.map(
    ([coefficient], i) => mul(coefficient, factors[i % 2]) >>> 0,
  );

  const offsets = COEFFICIENTS.map(([, offset]) => offset);

  const padded = Buffer.alloc(Math.ceil((data.length + 1) / 8) * 8);

  padded.set(data, 1);

  for (let i = 0; i < padded.length / 4; i++) {
    const word = padded.readUInt32LE(i * 4);

    let term = mul(word, i % 2 === 0 ? keyA : keyB);

    let offset = mul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db);

    if (i === 0) {
      term = (term + mul(0xf2f90b1a, factors[0])) >>> 0;

      offset = (offset + 0x0b1a0000) >>> 0;
    }

    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = rol16((offsets[i] + x) >>> 0);
    let q = mul(t, 0x76f50f34);

    swapAcc += (mul(rol16(q), 0xc3efea97) + q) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = mul(t, 0x1881ce3c);

    swapLast = (mul(rol16(q), 0x35bd1ec9) + q) >>> 0;

    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (mul(state, keyA) + x) >>> 0;

    for (const k of [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]) {
      state = mul(rol16(state), k) >>> 0;
    }

    acc += state;

    t = (mul(state, keyB) + y) >>> 0;
    t = mul(rol16(t), 0xa27416f5) >>> 0;
    t = mul(rol16(t), 0xd38396ff) >>> 0;

    state = mul(rol16(mul(rol16(t), 0x7c932b89)), 0xbfa49f69) >>> 0;

    acc = (acc + state) >>> 0;
  }

  const result = Buffer.allocUnsafe(8);

  result.writeUInt32LE((swapLast ^ state) >>> 0, 0);

  result.writeUInt32LE((swapAcc ^ acc) >>> 0, 4);

  return result;
}

/**
 * 根据 Unix 时间戳生成 Sec-MS-GEC v2 Token
 *
 * @param unixSeconds Unix 时间戳（秒）
 * @returns CS64-SHA256 格式的 Token
 */
function generateSecMsGecToken_V2(unixSeconds = Date.now() / 1000) {
  if (!Number.isFinite(unixSeconds)) {
    throw new TypeError("unixSeconds must be a finite number");
  }

  const epochSeconds =
    BigInt(Math.floor(unixSeconds)) + WINDOWS_FILE_TIME_EPOCH;

  const roundedSeconds = epochSeconds - (epochSeconds % 300n);

  const ticks = roundedSeconds * 10000000n;

  const data = Buffer.from(`${ticks}${TRUSTED_CLIENT_TOKEN}`, "ascii");

  const sha = createHash("sha256")
    .update(new Uint8Array(PREFIX))
    .update(new Uint8Array(data))
    .digest();

  const cs64 = cs64Digest(data, sha);

  return (
    `${cs64.toString("hex").toUpperCase()}-` + sha.toString("hex").toUpperCase()
  );
}

module.exports = {
  generateSecMsGecToken_V2,
  TRUSTED_CLIENT_TOKEN,
  SEC_MS_GEC_VERSION_V2,
  CHROMIUM_FULL_VERSION,
};
