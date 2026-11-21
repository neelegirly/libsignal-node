'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const libsignal = require('..');
const { MemoryStore, createParty, connect, cipher, decrypt } = require('./helpers/store');

const text = (s) => Buffer.from(s, 'utf8');

async function send(from, to, s) {
    return cipher(from, to).encrypt(text(s));
}

async function receive(self, peer, message) {
    return (await decrypt(self, peer, message)).toString('utf8');
}

test('Sitzung mit PreKeyBundle: erste PreKey-Nachricht, Antwort, Folgenachricht', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    assert.equal(await cipher(alice, bob).hasOpenSession(), true);
    assert.equal(await cipher(bob, alice).hasOpenSession(), false);

    const m1 = await send(alice, bob, 'Hallo Bob 💖');
    assert.equal(m1.type, 3, 'erste Nachricht ist eine PreKey-Nachricht');
    assert.equal(m1.registrationId, bob.store.registrationId);
    assert.equal(await receive(bob, alice, m1), 'Hallo Bob 💖');
    assert.deepEqual(bob.store.removedPreKeys, [31], 'verbrauchter One-Time-PreKey wird entfernt');
    assert.equal(await cipher(bob, alice).hasOpenSession(), true);

    const m2 = await send(alice, bob, 'noch ohne Antwort');
    assert.equal(m2.type, 3, 'bis zur ersten Antwort bleibt es eine PreKey-Nachricht');
    assert.equal(await receive(bob, alice, m2), 'noch ohne Antwort');
    assert.deepEqual(bob.store.removedPreKeys, [31], 'PreKey wird nur einmal entfernt');

    const r1 = await send(bob, alice, 'Hallo Alice');
    assert.equal(r1.type, 1, 'Antwort ist eine normale Nachricht');
    assert.equal(await receive(alice, bob, r1), 'Hallo Alice');

    const m3 = await send(alice, bob, 'Folgenachricht');
    assert.equal(m3.type, 1, 'nach der Antwort normale Nachrichten');
    assert.equal(await receive(bob, alice, m3), 'Folgenachricht');
});

test('Bundle ohne One-Time-PreKey funktioniert', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob', { withPreKey: false });
    await connect(alice, bob);
    const m1 = await send(alice, bob, 'nur SignedPreKey');
    assert.equal(m1.type, 3);
    assert.equal(await receive(bob, alice, m1), 'nur SignedPreKey');
    assert.deepEqual(bob.store.removedPreKeys, []);
    assert.equal(await receive(alice, bob, await send(bob, alice, 'ok')), 'ok');
});

test('viele Runden Hin und Rück (Ratchet-Schritte) und leere/große Nachrichten', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    assert.equal(await receive(bob, alice, await send(alice, bob, 'start')), 'start');
    for (let round = 0; round < 10; round++) {
        const burst = 1 + (round % 3);
        for (let i = 0; i < burst; i++) {
            assert.equal(await receive(alice, bob, await send(bob, alice, `b${round}.${i}`)), `b${round}.${i}`);
        }
        for (let i = 0; i < burst; i++) {
            assert.equal(await receive(bob, alice, await send(alice, bob, `a${round}.${i}`)), `a${round}.${i}`);
        }
    }
    const empty = await cipher(alice, bob).encrypt(Buffer.alloc(0));
    assert.equal((await decrypt(bob, alice, empty)).length, 0);
    const big = Buffer.alloc(256 * 1024, 0xab);
    assert.deepEqual(await decrypt(alice, bob, await cipher(bob, alice).encrypt(big)), big);
});

test('Zustellung in falscher Reihenfolge (übersprungene Nachrichtenschlüssel)', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    assert.equal(await receive(bob, alice, await send(alice, bob, 'init')), 'init');
    await receive(alice, bob, await send(bob, alice, 'ack'));

    const msgs = [];
    for (let i = 0; i < 5; i++) {
        msgs.push(await send(alice, bob, `n${i}`));
    }
    for (const i of [3, 0, 4, 2, 1]) {
        assert.equal(await receive(bob, alice, msgs[i]), `n${i}`);
    }

    // Nachricht aus der vorigen Kette kommt erst nach einem Ratchet-Schritt an.
    const late = await send(bob, alice, 'spät');
    assert.equal(await receive(bob, alice, await send(alice, bob, 'dazwischen')), 'dazwischen');
    const next = await send(bob, alice, 'neu');
    assert.equal(await receive(alice, bob, next), 'neu');
    assert.equal(await receive(alice, bob, late), 'spät');
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Alice und Bob haben eine Sitzung; eine Nachricht aus ihr ist noch unterwegs.
 * Dann baut Alice mit einem neuen Bundle von Bob neu auf (z. B. nach einem Reset).
 */
async function resetScenario() {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    await receive(bob, alice, await send(alice, bob, 'erste Sitzung'));
    await receive(alice, bob, await send(bob, alice, 'ack'));
    const delayed = await send(alice, bob, 'unterwegs aus der alten Sitzung');

    // getSessions() sortiert nach indexInfo.used (ms); die Pause macht die Reihenfolge eindeutig.
    await pause(15);
    const freshPreKey = libsignal.keyhelper.generatePreKey(32);
    bob.store.addPreKey(freshPreKey);
    await new libsignal.SessionBuilder(alice.store, bob.address).initOutgoing(Object.assign({}, bob.bundle, {
        preKey: { keyId: 32, publicKey: freshPreKey.keyPair.pubKey }
    }));
    const fresh = await send(alice, bob, 'neue Sitzung');
    assert.equal(fresh.type, 3);
    return { alice, bob, delayed, fresh };
}

test('erneuter Sitzungsaufbau: verspätete alte Nachricht vor der neuen, beide lesbar', async () => {
    const { alice, bob, delayed, fresh } = await resetScenario();
    assert.equal(await receive(bob, alice, delayed), 'unterwegs aus der alten Sitzung');
    assert.equal(await receive(bob, alice, fresh), 'neue Sitzung');

    const record = await bob.store.loadSession(alice.address.toString());
    const sessions = Object.values(record.sessions);
    assert.equal(sessions.length, 2, 'alte Sitzung bleibt geschlossen erhalten');
    assert.equal(sessions.filter((s) => record.isClosed(s)).length, 1);
    assert.equal(await receive(alice, bob, await send(bob, alice, 'Antwort in neuer Sitzung')), 'Antwort in neuer Sitzung');
    assert.equal(await receive(bob, alice, await send(alice, bob, 'weiter')), 'weiter');
});

test('BEKANNTER UPSTREAM-FEHLER: verspätete alte Nachricht nach der neuen verändert die offene Sitzung', async () => {
    // Festgehaltenes Ist-Verhalten (identisch mit libsignal-node/WhiskeySockets 6.0.0):
    // decryptWithSessions() probiert die Nachricht zuerst mit der zuletzt benutzten (neuen)
    // Sitzung. Der Fehlversuch macht dabei schon einen Ratchet-Schritt an genau diesem
    // Sitzungsobjekt. Gelingt danach die alte Sitzung, wird der ganze Datensatz gespeichert,
    // samt der verdorbenen neuen Sitzung. Bobs nächste Antwort kann Alice nicht entschlüsseln.
    // Der Signal-Code bleibt hier bewusst unverändert; dieser Test hält nur das heutige
    // Verhalten fest. Eine Behebung müsste jeden Versuch auf einer Kopie der Sitzung
    // ausführen und nur die erfolgreiche übernehmen. Dann schlägt dieser Test fehl und ist
    // auf das richtige Verhalten (Antwort lesbar) umzustellen.
    const { alice, bob, delayed, fresh } = await resetScenario();
    assert.equal(await receive(bob, alice, fresh), 'neue Sitzung');

    const addr = alice.address.toString();
    const openBefore = (await bob.store.loadSession(addr)).getOpenSession().serialize().currentRatchet;
    assert.equal(await receive(bob, alice, delayed), 'unterwegs aus der alten Sitzung');
    const openAfter = (await bob.store.loadSession(addr)).getOpenSession().serialize().currentRatchet;
    assert.notDeepEqual(openAfter, openBefore, 'Fehlversuch hat die offene Sitzung verändert');

    await assert.rejects(receive(alice, bob, await send(bob, alice, 'Antwort')),
        { name: 'SessionError', message: 'No matching sessions found for message' });
});

test('gespeicherte Sitzung wiederherstellen (Neustart) und weiter ver-/entschlüsseln', async () => {
    let alice = createParty('alice');
    let bob = createParty('bob');
    await connect(alice, bob);
    await receive(bob, alice, await send(alice, bob, 'vor dem Neustart'));
    await receive(alice, bob, await send(bob, alice, 'ack'));
    const inFlight = await send(alice, bob, 'während des Neustarts unterwegs');

    // "Neustart": nur der serialisierte Zustand überlebt, alle Objekte sind neu.
    const aliceDump = alice.store.dump();
    const bobDump = bob.store.dump();
    alice = Object.assign({}, alice, { store: MemoryStore.restore(aliceDump) });
    bob = Object.assign({}, bob, { store: MemoryStore.restore(bobDump) });

    assert.equal(await receive(bob, alice, inFlight), 'während des Neustarts unterwegs');
    assert.equal(await receive(alice, bob, await send(bob, alice, 'nach dem Neustart')), 'nach dem Neustart');
    assert.equal(await receive(bob, alice, await send(alice, bob, 'weiter')), 'weiter');
});

test('SessionRecord: serialize/deserialize ist verlustfrei', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    await receive(bob, alice, await send(alice, bob, 'x'));
    for (const store of [alice.store, bob.store]) {
        const [addr] = [...store.sessions.keys()];
        const record = await store.loadSession(addr);
        assert.ok(record instanceof libsignal.SessionRecord);
        const once = record.serialize();
        const twice = libsignal.SessionRecord.deserialize(JSON.parse(JSON.stringify(once))).serialize();
        assert.deepEqual(twice, once);
        assert.equal(once.version, 'v1');
    }
});

test('SessionRecord: Migration alter Datensätze und unbekannte Version', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    const data = JSON.parse(alice.store.sessions.get(bob.address.toString()));

    const legacy = JSON.parse(JSON.stringify(data));
    delete legacy.version;
    legacy.registrationId = 777;
    for (const s of Object.values(legacy._sessions)) {
        delete s.registrationId;
    }
    const migrated = libsignal.SessionRecord.deserialize(legacy);
    for (const s of Object.values(migrated.sessions)) {
        assert.equal(s.registrationId, 777);
    }

    const unknown = JSON.parse(JSON.stringify(data));
    unknown.version = 'v999';
    assert.throws(() => libsignal.SessionRecord.deserialize(unknown), /Error migrating SessionRecord/);
});

test('closeOpenSession schließt die Sitzung, danach kein Verschlüsseln mehr', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    await cipher(alice, bob).closeOpenSession();
    assert.equal(await cipher(alice, bob).hasOpenSession(), false);
    await assert.rejects(send(alice, bob, 'x'), { name: 'SessionError', message: 'No open session' });
});

test('parallele Aufrufe werden je Adresse serialisiert (queueJob)', async () => {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    await receive(bob, alice, await send(alice, bob, 'init'));
    await receive(alice, bob, await send(bob, alice, 'ack'));
    const sent = await Promise.all(Array.from({ length: 20 }, (_, i) => send(alice, bob, `p${i}`)));
    const got = await Promise.all(sent.map((m) => receive(bob, alice, m)));
    assert.deepEqual(got, Array.from({ length: 20 }, (_, i) => `p${i}`));
});
