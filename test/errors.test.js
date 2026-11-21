'use strict';

// Falsche Schlüssel, beschädigte oder wiederholte Nachrichten müssen mit einem
// definierten Fehler (abgelehntes Promise) enden, nie mit einem Absturz, und
// dürfen den gespeicherten Zustand nicht beschädigen.

const test = require('node:test');
const assert = require('node:assert/strict');
const libsignal = require('..');
const protobufs = require('../src/protobufs');
const { MemoryStore, createParty, connect, cipher, decrypt } = require('./helpers/store');

const NO_MATCH = { name: 'SessionError', message: 'No matching sessions found for message' };

async function established() {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    await decrypt(bob, alice, await cipher(alice, bob).encrypt(Buffer.from('init')));
    await decrypt(alice, bob, await cipher(bob, alice).encrypt(Buffer.from('ack')));
    return { alice, bob };
}

function flip(buf, index) {
    const copy = Buffer.from(buf);
    copy[index < 0 ? copy.length + index : index] ^= 0x01;
    return copy;
}

/** Ersetzt in einer PreKey-Nachricht die innere WhisperMessage. */
function withInnerMessage(body, mutate) {
    const proto = protobufs.PreKeyWhisperMessage.decode(body.slice(1));
    proto.message = mutate(Buffer.from(proto.message));
    return Buffer.concat([body.slice(0, 1), Buffer.from(protobufs.PreKeyWhisperMessage.encode(proto).finish())]);
}

test('beschädigte normale Nachricht (MAC, Inhalt, Kopf) -> SessionError, Zustand bleibt intakt', async () => {
    const { alice, bob } = await established();
    const msg = await cipher(bob, alice).encrypt(Buffer.from('echt'));
    assert.equal(msg.type, 1);
    for (const index of [-1, -8, -12, 3, 6]) {
        await assert.rejects(cipher(alice, bob).decryptWhisperMessage(flip(msg.body, index)), NO_MATCH, `Byte ${index}`);
    }
    // Die echte Nachricht ist danach weiterhin entschlüsselbar.
    assert.equal((await decrypt(alice, bob, msg)).toString(), 'echt');
});

test('abgeschnittene, leere und zufällige Nachrichten -> definierter Fehler', async () => {
    const { alice, bob } = await established();
    const msg = await cipher(bob, alice).encrypt(Buffer.from('echt'));
    const c = cipher(alice, bob);
    await assert.rejects(c.decryptWhisperMessage(msg.body.slice(0, 5)), NO_MATCH);
    await assert.rejects(c.decryptWhisperMessage(msg.body.slice(0, -1)), NO_MATCH);
    await assert.rejects(c.decryptWhisperMessage(Buffer.alloc(0)), NO_MATCH);
    await assert.rejects(c.decryptWhisperMessage(Buffer.from('33' + 'ff'.repeat(40), 'hex')), NO_MATCH);
    assert.equal((await decrypt(alice, bob, msg)).toString(), 'echt');
});

test('falsche Protokollversion wird abgelehnt', async () => {
    const { alice, bob } = await established();
    const msg = await cipher(bob, alice).encrypt(Buffer.from('v'));
    const wrong = Buffer.from(msg.body);
    wrong[0] = 0x22;
    await assert.rejects(cipher(alice, bob).decryptWhisperMessage(wrong), NO_MATCH);

    const fresh = createParty('carol');
    await connect(fresh, bob);
    const pre = await cipher(fresh, bob).encrypt(Buffer.from('v'));
    const wrongPre = Buffer.from(pre.body);
    wrongPre[0] = 0x22;
    await assert.rejects(cipher(bob, fresh).decryptPreKeyWhisperMessage(wrongPre),
        { message: 'Incompatible version number on PreKeyWhisperMessage' });
});

test('doppelt zugestellte Nachricht -> definierter Fehler', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    const pre = await cipher(alice, bob).encrypt(Buffer.from('einmal'));
    await decrypt(bob, alice, pre);
    await assert.rejects(decrypt(bob, alice, pre), { name: 'MessageCounterError' });
    assert.ok(libsignal.MessageCounterError.prototype instanceof libsignal.SessionError);

    const normal = await cipher(bob, alice).encrypt(Buffer.from('einmal'));
    await decrypt(alice, bob, normal);
    await assert.rejects(decrypt(alice, bob, normal), NO_MATCH);
});

test('Nachricht für jemand anderen / mit falschen Schlüsseln -> definierter Fehler', async () => {
    const { alice, bob } = await established();
    const carol = createParty('carol');
    // Bobs One-Time-PreKey 31 hat Alice schon verbraucht; Carol bekommt einen eigenen.
    const carolsPreKey = libsignal.keyhelper.generatePreKey(33);
    bob.store.addPreKey(carolsPreKey);
    await new libsignal.SessionBuilder(carol.store, bob.address).initOutgoing(Object.assign({}, bob.bundle, {
        preKey: { keyId: 33, publicKey: carolsPreKey.keyPair.pubKey }
    }));
    await decrypt(bob, carol, await cipher(carol, bob).encrypt(Buffer.from('init')));
    const toCarol = await cipher(bob, carol).encrypt(Buffer.from('für Carol'));

    // Alice versucht, Carols Nachricht mit ihrer eigenen Sitzung zu Bob zu entschlüsseln.
    await assert.rejects(cipher(alice, bob).decryptWhisperMessage(toCarol.body), NO_MATCH);

    // Gleiche Sitzungsdaten, aber falsche eigene Identität -> MAC passt nicht.
    const impostorStore = MemoryStore.restore(alice.store.dump());
    impostorStore.identityKeyPair = libsignal.keyhelper.generateIdentityKeyPair();
    const toAlice = await cipher(bob, alice).encrypt(Buffer.from('für Alice'));
    await assert.rejects(new libsignal.SessionCipher(impostorStore, bob.address).decryptWhisperMessage(toAlice.body), NO_MATCH);
    assert.equal((await decrypt(alice, bob, toAlice)).toString(), 'für Alice');
});

test('beschädigte PreKey-Nachricht: falscher MAC -> Bad MAC, nichts wird gespeichert oder verbraucht', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    const pre = await cipher(alice, bob).encrypt(Buffer.from('erste'));

    const badMac = withInnerMessage(pre.body, (m) => flip(m, -1));
    await assert.rejects(cipher(bob, alice).decryptPreKeyWhisperMessage(badMac), { message: 'Bad MAC' });
    const badBody = withInnerMessage(pre.body, (m) => flip(m, 10));
    await assert.rejects(cipher(bob, alice).decryptPreKeyWhisperMessage(badBody));

    assert.equal(bob.store.sessions.size, 0, 'keine Sitzung gespeichert');
    assert.deepEqual(bob.store.removedPreKeys, [], 'PreKey nicht verbraucht');
    assert.equal((await decrypt(bob, alice, pre)).toString(), 'erste');
});

test('kaputte PreKey-Hülle (Protobuf, falsche IDs) -> definierter Fehler', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    const pre = await cipher(alice, bob).encrypt(Buffer.from('erste'));
    const c = cipher(bob, alice);

    await assert.rejects(c.decryptPreKeyWhisperMessage(Buffer.from([0x33, 0xff, 0xff, 0xff])), Error);
    await assert.rejects(c.decryptPreKeyWhisperMessage(pre.body.slice(0, 20)), Error);

    const proto = protobufs.PreKeyWhisperMessage.decode(pre.body.slice(1));
    const reencode = (changes) => Buffer.concat([pre.body.slice(0, 1),
        Buffer.from(protobufs.PreKeyWhisperMessage.encode(Object.assign(
            protobufs.PreKeyWhisperMessage.create(proto), changes)).finish())]);
    await assert.rejects(c.decryptPreKeyWhisperMessage(reencode({ signedPreKeyId: 99 })),
        { name: 'PreKeyError', message: 'Missing SignedPreKey' });
    await assert.rejects(c.decryptPreKeyWhisperMessage(reencode({ preKeyId: 99 })),
        { name: 'PreKeyError', message: 'Invalid PreKey ID' });

    assert.equal(bob.store.sessions.size, 0);
    assert.equal((await decrypt(bob, alice, pre)).toString(), 'erste');
});

test('tief verschachtelte Protobuf-Gruppen (Rekursionsangriff) -> definierter Fehler, kein Absturz', async () => {
    // Unbekanntes Feld 15 mit Wire-Type 3 (Start-Group), 200000-mal verschachtelt.
    // protobufjs < 7.5.6 läuft hier in einen Stack-Überlauf (RangeError), neuere Versionen
    // brechen bei der Rekursionsgrenze ab. In beiden Fällen: abgelehntes Promise.
    const nested = Buffer.concat([Buffer.from([0x33]), Buffer.alloc(200000, (15 << 3) | 3)]);
    const { alice, bob } = await established();
    await assert.rejects(cipher(bob, alice).decryptPreKeyWhisperMessage(nested), Error);
    await assert.rejects(cipher(bob, alice).decryptWhisperMessage(Buffer.concat([nested, Buffer.alloc(8)])), NO_MATCH);
    // Sitzung funktioniert danach weiter.
    const ok = await cipher(alice, bob).encrypt(Buffer.from('weiter'));
    assert.equal((await decrypt(bob, alice, ok)).toString(), 'weiter');
});

test('erneut eingespielte PreKey-Nachricht nach verbrauchtem PreKey -> PreKeyError', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    const pre = await cipher(alice, bob).encrypt(Buffer.from('erste'));
    await decrypt(bob, alice, pre);
    bob.store.sessions.clear();
    await assert.rejects(decrypt(bob, alice, pre), { name: 'PreKeyError', message: 'Invalid PreKey ID' });
});

test('ohne Sitzung / ohne Vertrauen / falsche Typen -> definierter Fehler', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await assert.rejects(cipher(alice, bob).encrypt(Buffer.from('x')), { name: 'SessionError', message: 'No sessions' });
    await assert.rejects(cipher(alice, bob).decryptWhisperMessage(Buffer.from('3300', 'hex')),
        { name: 'SessionError', message: 'No session record' });

    const suspicious = createParty('mallory', { store: new MemoryStore({ trustAll: false }) });
    await assert.rejects(connect(suspicious, bob), { name: 'UntrustedIdentityKeyError' });
    await connect(alice, bob);
    const pre = await cipher(alice, bob).encrypt(Buffer.from('x'));
    bob.store.trustAll = false;
    await assert.rejects(decrypt(bob, alice, pre), { name: 'UntrustedIdentityKeyError' });
    bob.store.trustAll = true;

    await assert.rejects(cipher(alice, bob).encrypt('kein Buffer'), TypeError);
    await assert.rejects(cipher(alice, bob).decryptWhisperMessage('kein Buffer'), TypeError);
    await assert.rejects(cipher(alice, bob).decryptPreKeyWhisperMessage('kein Buffer'), TypeError);
    assert.throws(() => new libsignal.SessionCipher(alice.store, 'bob.1'), TypeError);
});

test('kaputtes Bundle: falsche Signaturlänge wird abgelehnt', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    const bundle = Object.assign({}, bob.bundle, {
        signedPreKey: Object.assign({}, bob.bundle.signedPreKey, { signature: Buffer.alloc(10) })
    });
    await assert.rejects(new libsignal.SessionBuilder(alice.store, bob.address).initOutgoing(bundle),
        { message: 'Invalid signature' });
    assert.equal(alice.store.sessions.size, 0);
});

test('Upstream-Verhalten festgehalten: initOutgoing prüft die SignedPreKey-Signatur nicht', async () => {
    // libsignal-node (WhiskeySockets) ruft verifySignature(..., isInit = true) auf, eine
    // falsche Signatur wird daher beim Aufbau akzeptiert. Hier bewusst nicht geändert
    // ("nichts an der Kryptografie ändern"); der Test macht jede Änderung sichtbar.
    const alice = createParty('alice');
    const bob = createParty('bob');
    const bundle = Object.assign({}, bob.bundle, {
        signedPreKey: Object.assign({}, bob.bundle.signedPreKey, { signature: Buffer.alloc(64) })
    });
    await new libsignal.SessionBuilder(alice.store, bob.address).initOutgoing(bundle);
    assert.equal(await cipher(alice, bob).hasOpenSession(), true);
});

test('mehr als 2000 Nachrichten in die Zukunft -> definierter Fehler', async () => {
    const { alice, bob } = await established();
    let last;
    for (let i = 0; i < 2002; i++) {
        last = await cipher(alice, bob).encrypt(Buffer.from('f'));
    }
    await assert.rejects(cipher(bob, alice).decryptWhisperMessage(last.body), NO_MATCH);
});
