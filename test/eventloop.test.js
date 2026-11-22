'use strict';

// decryptWithSessions() probiert bei vielen Sitzungen eine nach der anderen und
// gibt dabei etwa alle 15 ms den Event-Loop frei (setImmediate). Die Tests
// steuern die Zeit über ein vorgestelltes Date.now (keine echte Laufzeit, keine
// mock.timers): jeder Entschlüsselungsversuch "kostet" eine feste Anzahl ms.

const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const libsignal = require('..');
const { createParty, connect, cipher, decrypt } = require('./helpers/store');

const NO_MATCH = { name: 'SessionError', message: 'No matching sessions found for message' };
const DECOYS = 2000;
const MS_PER_ATTEMPT = 4;   // > 15 ms nach dem 4. Versuch seit der letzten Freigabe
const PLAINTEXT = 'nach vielen Sitzungen 💖';

function digest(label) {
    return nodeCrypto.createHash('sha256').update(label).digest();
}

/**
 * Bob hat eine echte Sitzung mit Alice und bekommt eine normale Nachricht.
 * Sein Datensatz erhält `decoys` geschlossene, nicht passende Sitzungen
 * (eigener Basisschlüssel, anderer Root-Key -> Bad MAC), die alle vor der
 * echten probiert werden. Ohne `withReal` fehlt die echte Sitzung ganz.
 */
async function scenario({ decoys, withReal = true }) {
    const alice = createParty('alice');
    const bob = createParty('bob');
    await connect(alice, bob);
    await decrypt(bob, alice, await cipher(alice, bob).encrypt(Buffer.from('init')));
    await decrypt(alice, bob, await cipher(bob, alice).encrypt(Buffer.from('ack')));
    const message = await cipher(alice, bob).encrypt(Buffer.from(PLAINTEXT));
    assert.equal(message.type, 1);

    const addr = alice.address.toString();
    const data = JSON.parse(bob.store.sessions.get(addr));
    const [realKey] = Object.keys(data._sessions);
    const real = data._sessions[realKey];
    real.indexInfo.used = 1;  // zuletzt probiert
    const sessions = withReal ? { [realKey]: real } : {};
    for (let i = 0; i < decoys; i++) {
        const decoy = JSON.parse(JSON.stringify(real));
        const baseKey = Buffer.concat([Buffer.from([5]), digest(`decoy-base-${i}`)]).toString('base64');
        decoy.indexInfo.baseKey = baseKey;
        decoy.indexInfo.closed = 1000 + i;
        decoy.indexInfo.used = 1000 + i;
        decoy.currentRatchet.rootKey = digest(`decoy-root-${i}`).toString('base64');
        sessions[baseKey] = decoy;
    }
    data._sessions = sessions;
    bob.store.sessions.set(addr, JSON.stringify(data));
    return { alice, bob, addr, message, realKey };
}

/**
 * Entschlüsselt mit vorgestelltem Date.now. Vor dem Aufruf sind ein
 * setImmediate, ein Timer und ein sich selbst neu einplanender "Ticker"
 * eingeplant; festgehalten wird, nach wie vielen Versuchen sie drankamen.
 */
async function decryptObserved(sc, { msPerAttempt, onAttempt }) {
    const realNow = Date.now;
    let clock = 1_800_000_000_000 + (++decryptObserved.runs) * 10_000_000;
    let attempts = 0;
    let done = false;
    const seen = { immediate: undefined, timer: undefined, ticks: [] };

    const c = cipher(sc.bob, sc.alice);
    c.doDecryptWhisperMessage = async function(...args) {
        attempts++;
        clock += msPerAttempt;
        if (onAttempt) {
            clock = onAttempt(attempts, clock);
        }
        return libsignal.SessionCipher.prototype.doDecryptWhisperMessage.apply(this, args);
    };

    setImmediate(() => { seen.immediate = attempts; });
    const timer = setTimeout(() => { seen.timer = attempts; }, 0);
    const tick = () => {
        if (!done) {
            seen.ticks.push(attempts);
            setImmediate(tick);
        }
    };
    setImmediate(tick);

    Date.now = () => clock;
    let result, error;
    try {
        result = await c.decryptWhisperMessage(sc.message.body);
    } catch (e) {
        error = e;
    } finally {
        Date.now = realNow;
        done = true;
        clearTimeout(timer);
    }
    return { result, error, attempts, seen };
}
decryptObserved.runs = 0;

function expectedYieldPoints(total, msPerAttempt) {
    // Spiegelbild der Regel in decryptWithSessions: vor Versuch k (0-basiert)
    // steht die Uhr auf k * msPerAttempt; Freigabe, wenn > 15 ms seit der letzten.
    const points = [];
    let sliceStart = 0;
    for (let k = 0; k < total; k++) {
        if (k * msPerAttempt - sliceStart > 15) {
            points.push(k);
            sliceStart = k * msPerAttempt;
        }
    }
    return points;
}

async function keptSessionKeys(sc) {
    // Die Schlüssel der Köder sind fest; die echte Sitzung hat je Szenario einen
    // zufälligen Basisschlüssel und erscheint deshalb als "echt".
    const record = await sc.bob.store.loadSession(sc.addr);
    return Object.keys(record.sessions).map((k) => (k === sc.realKey ? 'echt' : k)).sort();
}

test('2000 nicht passende + 1 passende Sitzung: Event-Loop wird freigegeben, Klartext wie ohne Freigabe', async () => {
    const total = DECOYS + 1;

    // Lauf ohne Freigabe: die Uhr steht, also gibt es keine Pause.
    const plain = await scenario({ decoys: DECOYS });
    const without = await decryptObserved(plain, { msPerAttempt: 0 });
    assert.equal(without.error, undefined);
    assert.equal(without.attempts, total);
    assert.deepEqual(without.seen.ticks, [], 'ohne vorrückende Uhr keine Freigabe');
    assert.equal(without.seen.immediate, undefined);

    // Gleicher Fall mit vorrückender Uhr.
    const sc = await scenario({ decoys: DECOYS });
    const withYield = await decryptObserved(sc, { msPerAttempt: MS_PER_ATTEMPT });
    assert.equal(withYield.error, undefined);
    assert.equal(withYield.attempts, total, 'jede Sitzung genau einmal, passende zuletzt');

    // Vorher eingeplante Rückrufe kamen mitten in der Schleife dran.
    assert.equal(withYield.seen.immediate, 4, 'setImmediate nach dem 4. Versuch');
    assert.ok(withYield.seen.timer !== undefined && withYield.seen.timer < total,
        `Timer kam während der Schleife dran (nach ${withYield.seen.timer} Versuchen)`);
    assert.deepEqual(withYield.seen.ticks, expectedYieldPoints(total, MS_PER_ATTEMPT));
    assert.equal(withYield.seen.ticks.length, 500);

    // Ergebnis identisch zum Lauf ohne Freigabe.
    assert.equal(withYield.result.toString('utf8'), PLAINTEXT);
    assert.deepEqual(withYield.result, without.result);
    const keptWith = await keptSessionKeys(sc);
    assert.deepEqual(keptWith, await keptSessionKeys(plain), 'gleiche Sitzungen gespeichert');
    assert.equal(keptWith.length, 40, 'beim Speichern auf 40 Sitzungen begrenzt');
    assert.ok(keptWith.includes('echt'));
    const record = await sc.bob.store.loadSession(sc.addr);
    assert.equal(record.getOpenSession().indexInfo.baseKey.toString('base64'), sc.realKey);
    assert.ok(record.getOpenSession().indexInfo.used > 1, 'indexInfo.used der gewinnenden Sitzung gesetzt');

    // Die Sitzung funktioniert danach normal weiter.
    assert.equal((await decrypt(sc.alice, sc.bob, await cipher(sc.bob, sc.alice).encrypt(Buffer.from('ok')))).toString(), 'ok');
});

test('2000 Sitzungen, keine passt: gleicher Fehler und gleiche Fehlersammlung wie ohne Freigabe', async () => {
    const warnings = [];
    const realWarn = console.warn;
    const realFlag = process.env.ONIMAI_LOG_SIGNAL_DECRYPT_WARN;
    process.env.ONIMAI_LOG_SIGNAL_DECRYPT_WARN = '1';
    console.warn = (...args) => { warnings.push(args.join(' ')); };
    try {
        const plain = await scenario({ decoys: DECOYS, withReal: false });
        const stored = plain.bob.store.sessions.get(plain.addr);
        const without = await decryptObserved(plain, { msPerAttempt: 0 });
        assert.deepEqual(without.seen.ticks, []);

        const sc = await scenario({ decoys: DECOYS, withReal: false });
        const withYield = await decryptObserved(sc, { msPerAttempt: MS_PER_ATTEMPT });

        for (const run of [without, withYield]) {
            assert.equal(run.result, undefined);
            assert.ok(run.error instanceof libsignal.SessionError);
            assert.equal(run.error.name, NO_MATCH.name);
            assert.equal(run.error.message, NO_MATCH.message);
            assert.equal(run.attempts, DECOYS);
        }
        assert.equal(withYield.seen.immediate, 4);
        assert.ok(withYield.seen.timer !== undefined && withYield.seen.timer < DECOYS);
        assert.deepEqual(withYield.seen.ticks, expectedYieldPoints(DECOYS, MS_PER_ATTEMPT));

        // ONIMAI-Diagnose sieht in beiden Läufen alle 2000 Fehlversuche.
        const diag = warnings.filter((w) => w.startsWith('[ONIMAI signal-diag]'));
        assert.equal(diag.length, 2, diag.join('\n'));
        for (const line of diag) {
            assert.match(line, / sessions=2000 badMac=2000 counter=0 other=0 -> session_mismatch$/);
        }
        // Fehlschlag speichert nichts.
        assert.equal(plain.bob.store.sessions.get(plain.addr), stored);
    } finally {
        console.warn = realWarn;
        if (realFlag === undefined) {
            delete process.env.ONIMAI_LOG_SIGNAL_DECRYPT_WARN;
        } else {
            process.env.ONIMAI_LOG_SIGNAL_DECRYPT_WARN = realFlag;
        }
    }
});

test('wenige Sitzungen in kurzer Zeit: keine Freigabe', async () => {
    const sc = await scenario({ decoys: 39 });
    const run = await decryptObserved(sc, { msPerAttempt: 0.3 });  // 40 Versuche = 12 ms
    assert.equal(run.error, undefined);
    assert.equal(run.result.toString('utf8'), PLAINTEXT);
    assert.equal(run.attempts, 40);
    assert.deepEqual(run.seen.ticks, []);
    assert.equal(run.seen.immediate, undefined);
});

test('Uhr springt zurück: trotzdem Freigabe, Ergebnis unverändert', async () => {
    const sc = await scenario({ decoys: 9 });
    const run = await decryptObserved(sc, {
        msPerAttempt: 0,
        onAttempt: (attempt, clock) => (attempt === 3 ? clock - 3_600_000 : clock)
    });
    assert.equal(run.error, undefined);
    assert.equal(run.result.toString('utf8'), PLAINTEXT);
    assert.equal(run.attempts, 10);
    assert.deepEqual(run.seen.ticks, [3], 'eine Freigabe nach dem Rücksprung, danach normal weiter');
});

test('keine Sitzung im Datensatz: "No sessions available" wie bisher', async () => {
    const c = cipher(createParty('bob'), createParty('alice'));
    await assert.rejects(c.decryptWithSessions(Buffer.from([0x33]), []),
        { name: 'SessionError', message: 'No sessions available' });
});
