// Web Push for joyshua, with nothing but WebCrypto and fetch.
//
// A notification is sent straight to the push service a browser signed up
// with (Apple's, Google's, Mozilla's, Microsoft's). Two things make that work:
//   - VAPID (RFC 8292): a short JWT signed with our private key, so the push
//     service knows the message comes from whoever the browser subscribed to
//   - aes128gcm (RFC 8291): the payload is encrypted to the browser's own key,
//     so the push service carries it without being able to read it
//
// Keys come from the function's secrets (see scripts/joyshua_vapid.mjs):
//   VAPID_PUBLIC_KEY   base64url, the 65-byte uncompressed P-256 point
//   VAPID_PRIVATE_KEY  base64url, the 32-byte private scalar

export type Subscription = { endpoint: string; p256dh: string; auth: string };

// A byte array over a plain ArrayBuffer -- what WebCrypto and fetch take.
type Bytes = ReturnType<typeof Uint8Array.from>;

const enc = new TextEncoder();

export function b64u(bytes: Bytes): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64u(s: string): Bytes {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// The signed token that goes in the Authorization header. It's scoped to the
// push service's origin and good for 12 hours.
export async function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const pub = unb64u(publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(new Uint8Array(sig))}, k=${publicKey}`;
}

// The payload, encrypted to the browser's key: one aes128gcm record.
export async function encrypt(sub: Subscription, payload: string): Promise<Bytes> {
  const uaPublic = unb64u(sub.p256dh);
  const authSecret = unb64u(sub.auth);
  const ua = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, mine.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));      // 2: the last (only) record
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// Sends one notification. Resolves to the push service's status: 201 is
// delivered (or queued), 404/410 means the subscription is gone for good.
// `topic` lets a newer message replace one still waiting to be delivered.
export async function send(
  sub: Subscription,
  payload: string,
  keys: { publicKey: string; privateKey: string; subject: string },
  topic?: string,
): Promise<number> {
  const headers: Record<string, string> = {
    "Authorization": await vapidAuth(sub.endpoint, keys.publicKey, keys.privateKey, keys.subject),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    "TTL": String(3 * 24 * 3600),
    "Urgency": "normal",
  };
  if (topic) headers["Topic"] = topic;
  const res = await fetch(sub.endpoint, { method: "POST", headers, body: await encrypt(sub, payload) });
  await res.body?.cancel();
  return res.status;
}
