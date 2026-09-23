// Makes the key pair joyshua's notifications are signed with, and prints the
// command that stores it as the `joyshua` edge function's secrets.
//
//   node scripts/joyshua_vapid.mjs
//
// Run it once. Making a new pair later signs every device out of notifications
// (each would have to ring its bell again), so keep these where they are.

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log(`supabase secrets set VAPID_PUBLIC_KEY=${pub} VAPID_PRIVATE_KEY=${d} VAPID_SUBJECT=https://joshhou.com/joyshua`);
