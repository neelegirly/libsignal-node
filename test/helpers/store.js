'use strict';

// Test-only in-memory implementation of the storage interface that
// SessionBuilder / SessionCipher expect. Sessions are kept *serialized*
// (JSON string), exactly like a persistent store would keep them, so every
// test also exercises SessionRecord.serialize()/deserialize().
//
// All key material used with this store is generated inside the tests and
// has no meaning outside of them.

const libsignal = require('../..');

class MemoryStore {

    constructor({ identityKeyPair, registrationId, trustAll = true } = {}) {
        this.identityKeyPair = identityKeyPair || libsignal.keyhelper.generateIdentityKeyPair();
        this.registrationId = registrationId === undefined ?
            libsignal.keyhelper.generateRegistrationId() : registrationId;
        this.trustAll = trustAll;
        this.preKeys = new Map();
        this.signedPreKeys = new Map();
        this.sessions = new Map();
        this.removedPreKeys = [];
    }

    // --- interface used by libsignal ---

    async getOurIdentity() {
        return this.identityKeyPair;
    }

    async getOurRegistrationId() {
        return this.registrationId;
    }

    async isTrustedIdentity(_id, _identityKey) {
        return this.trustAll;
    }

    async loadPreKey(id) {
        return this.preKeys.get(id);
    }

    async removePreKey(id) {
        this.removedPreKeys.push(id);
        this.preKeys.delete(id);
    }

    async loadSignedPreKey(id) {
        return this.signedPreKeys.get(id);
    }

    async loadSession(addr) {
        const raw = this.sessions.get(addr);
        if (raw === undefined) {
            return undefined;
        }
        return libsignal.SessionRecord.deserialize(JSON.parse(raw));
    }

    async storeSession(addr, record) {
        this.sessions.set(addr, JSON.stringify(record.serialize()));
    }

    // --- helpers for the tests ---

    addPreKey(preKey) {
        this.preKeys.set(preKey.keyId, preKey.keyPair);
    }

    addSignedPreKey(signedPreKey) {
        this.signedPreKeys.set(signedPreKey.keyId, signedPreKey.keyPair);
    }

    /** Snapshot of everything a real store would persist (for restart tests). */
    dump() {
        return JSON.stringify({
            identityKeyPair: {
                pubKey: this.identityKeyPair.pubKey.toString('base64'),
                privKey: this.identityKeyPair.privKey.toString('base64')
            },
            registrationId: this.registrationId,
            preKeys: [...this.preKeys].map(([id, kp]) => [id, kp.pubKey.toString('base64'), kp.privKey.toString('base64')]),
            signedPreKeys: [...this.signedPreKeys].map(([id, kp]) => [id, kp.pubKey.toString('base64'), kp.privKey.toString('base64')]),
            sessions: [...this.sessions]
        });
    }

    static restore(dumped) {
        const d = JSON.parse(dumped);
        const store = new MemoryStore({
            identityKeyPair: {
                pubKey: Buffer.from(d.identityKeyPair.pubKey, 'base64'),
                privKey: Buffer.from(d.identityKeyPair.privKey, 'base64')
            },
            registrationId: d.registrationId
        });
        for (const [id, pub, priv] of d.preKeys) {
            store.preKeys.set(id, { pubKey: Buffer.from(pub, 'base64'), privKey: Buffer.from(priv, 'base64') });
        }
        for (const [id, pub, priv] of d.signedPreKeys) {
            store.signedPreKeys.set(id, { pubKey: Buffer.from(pub, 'base64'), privKey: Buffer.from(priv, 'base64') });
        }
        for (const [addr, raw] of d.sessions) {
            store.sessions.set(addr, raw);
        }
        return store;
    }
}

/**
 * Creates a party with identity, one signed pre key and (optionally) one
 * one-time pre key, and returns the PreKeyBundle other parties need.
 */
function createParty(name, { deviceId = 1, preKeyId = 31, signedPreKeyId = 7, withPreKey = true, store } = {}) {
    store = store || new MemoryStore();
    const signedPreKey = libsignal.keyhelper.generateSignedPreKey(store.identityKeyPair, signedPreKeyId);
    store.addSignedPreKey(signedPreKey);
    let preKey;
    if (withPreKey) {
        preKey = libsignal.keyhelper.generatePreKey(preKeyId);
        store.addPreKey(preKey);
    }
    const bundle = {
        identityKey: store.identityKeyPair.pubKey,
        registrationId: store.registrationId,
        signedPreKey: {
            keyId: signedPreKey.keyId,
            publicKey: signedPreKey.keyPair.pubKey,
            signature: signedPreKey.signature
        }
    };
    if (preKey) {
        bundle.preKey = { keyId: preKey.keyId, publicKey: preKey.keyPair.pubKey };
    }
    return {
        name,
        store,
        bundle,
        address: new libsignal.ProtocolAddress(name, deviceId)
    };
}

/** Builds an outgoing session from `from` to `to` using `to`'s PreKeyBundle. */
async function connect(from, to) {
    const builder = new libsignal.SessionBuilder(from.store, to.address);
    await builder.initOutgoing(to.bundle);
}

function cipher(self, peer) {
    return new libsignal.SessionCipher(self.store, peer.address);
}

/** Decrypts a message object as returned by SessionCipher#encrypt. */
async function decrypt(self, peer, message) {
    const c = cipher(self, peer);
    if (message.type === 3) {
        return c.decryptPreKeyWhisperMessage(message.body);
    }
    if (message.type === 1) {
        return c.decryptWhisperMessage(message.body);
    }
    throw new Error(`unexpected message type ${message.type}`);
}

module.exports = { MemoryStore, createParty, connect, cipher, decrypt };
