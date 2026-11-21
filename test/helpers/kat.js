'use strict';

// Deterministic end-to-end run of the protocol (known-answer test).
//
// All "random" key pairs are replaced by key pairs derived from fixed seeds:
// curve.generateKeyPair is temporarily swapped for a deterministic sequence
// (and restored afterwards). Nothing in the library itself is changed. With
// fixed keys, the X3DH-style agreement, HKDF, ratchet, AES-CBC, HMAC and the
// protobuf wire format are all deterministic, so the produced message bytes
// are a fingerprint of the complete crypto path. Any later change in one of
// these (e.g. through a dependency update) changes the bytes.
//
// The keys here are test-only and derived from public strings.

const nodeCrypto = require('crypto');
const libsignal = require('../..');
const curve = require('../../src/curve');
const { MemoryStore, connect, decrypt, cipher } = require('./store');

function seededKeyPair(label) {
    const privKey = nodeCrypto.createHash('sha256').update(`neelegirly-libsignal-kat:${label}`).digest();
    return { privKey, pubKey: curve.getPublicFromPrivateKey(privKey) };
}

function party(name, registrationId, { withPreKey = true } = {}) {
    const store = new MemoryStore({ identityKeyPair: seededKeyPair(`${name}:identity`), registrationId });
    const signedKeyPair = seededKeyPair(`${name}:signed-pre-key`);
    const signature = curve.calculateSignature(store.identityKeyPair.privKey, signedKeyPair.pubKey);
    store.addSignedPreKey({ keyId: 7, keyPair: signedKeyPair });
    const bundle = {
        identityKey: store.identityKeyPair.pubKey,
        registrationId,
        signedPreKey: { keyId: 7, publicKey: signedKeyPair.pubKey, signature }
    };
    if (withPreKey) {
        const preKeyPair = seededKeyPair(`${name}:pre-key`);
        store.addPreKey({ keyId: 31, keyPair: preKeyPair });
        bundle.preKey = { keyId: 31, publicKey: preKeyPair.pubKey };
    }
    return { name, store, bundle, address: new libsignal.ProtocolAddress(name, 1) };
}

async function runKat() {
    const original = curve.generateKeyPair;
    let n = 0;
    curve.generateKeyPair = () => seededKeyPair(`ephemeral:${++n}`);
    try {
        const alice = party('alice', 1234);
        const bob = party('bob', 4321);
        const out = {
            signedPreKeySignature: bob.bundle.signedPreKey.signature.toString('hex')
        };

        await connect(alice, bob);
        const m1 = await cipher(alice, bob).encrypt(Buffer.from('KAT: erste Nachricht'));
        out.m1 = { type: m1.type, body: m1.body.toString('hex') };
        out.m1Plain = (await decrypt(bob, alice, m1)).toString();

        const r1 = await cipher(bob, alice).encrypt(Buffer.from('KAT: Antwort'));
        out.r1 = { type: r1.type, body: r1.body.toString('hex') };
        out.r1Plain = (await decrypt(alice, bob, r1)).toString();

        const m2 = await cipher(alice, bob).encrypt(Buffer.from('KAT: Folgenachricht'));
        out.m2 = { type: m2.type, body: m2.body.toString('hex') };
        out.m2Plain = (await decrypt(bob, alice, m2)).toString();

        out.ephemeralKeysUsed = n;
        return out;
    } finally {
        curve.generateKeyPair = original;
    }
}

module.exports = { runKat, seededKeyPair };
