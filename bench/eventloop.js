'use strict';

// Misst die längste Event-Loop-Blockade beim Entschlüsseln mit vielen Sitzungen
// in einem Datensatz (perf_hooks.monitorEventLoopDelay).
//
//   node bench/eventloop.js                    # dieser Stand
//   node bench/eventloop.js --paket <ordner>   # anderer Stand, z. B. ein entpacktes älteres Release
//   node bench/eventloop.js --runden 7
//
// Nicht Teil des npm-Pakets und kein Test. Alle Schlüssel entstehen hier und
// haben außerhalb keine Bedeutung.

const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
}

const pkgDir = path.resolve(arg('--paket', path.join(__dirname, '..')));
const rounds = Number(arg('--runden', '5'));
const libsignal = require(pkgDir);
const pkgVersion = require(path.join(pkgDir, 'package.json')).version;

class Store {
    constructor() {
        this.identityKeyPair = libsignal.keyhelper.generateIdentityKeyPair();
        this.registrationId = libsignal.keyhelper.generateRegistrationId();
        this.preKeys = new Map();
        this.signedPreKeys = new Map();
        this.sessions = new Map();
    }
    async getOurIdentity() { return this.identityKeyPair; }
    async getOurRegistrationId() { return this.registrationId; }
    async isTrustedIdentity() { return true; }
    async loadPreKey(id) { return this.preKeys.get(id); }
    async removePreKey(id) { this.preKeys.delete(id); }
    async loadSignedPreKey(id) { return this.signedPreKeys.get(id); }
    async loadSession(addr) {
        const raw = this.sessions.get(addr);
        return raw === undefined ? undefined : libsignal.SessionRecord.deserialize(JSON.parse(raw));
    }
    async storeSession(addr, record) { this.sessions.set(addr, JSON.stringify(record.serialize())); }
}

function party(name) {
    const store = new Store();
    const signed = libsignal.keyhelper.generateSignedPreKey(store.identityKeyPair, 7);
    store.signedPreKeys.set(7, signed.keyPair);
    const pre = libsignal.keyhelper.generatePreKey(31);
    store.preKeys.set(31, pre.keyPair);
    return {
        store,
        address: new libsignal.ProtocolAddress(name, 1),
        bundle: {
            identityKey: store.identityKeyPair.pubKey,
            registrationId: store.registrationId,
            signedPreKey: { keyId: 7, publicKey: signed.keyPair.pubKey, signature: signed.signature },
            preKey: { keyId: 31, publicKey: pre.keyPair.pubKey }
        }
    };
}

const cipher = (self, peer) => new libsignal.SessionCipher(self.store, peer.address);
const digest = (label) => nodeCrypto.createHash('sha256').update(label).digest();

async function deliver(self, peer, msg) {
    const c = cipher(self, peer);
    return msg.type === 3 ? c.decryptPreKeyWhisperMessage(msg.body) : c.decryptWhisperMessage(msg.body);
}

/** Bob-Datensatz mit `count` Sitzungen; bei `match` ist die echte zuletzt dran, sonst passt keine. */
async function scenario(count, match) {
    const alice = party('alice');
    const bob = party('bob');
    await new libsignal.SessionBuilder(alice.store, bob.address).initOutgoing(bob.bundle);
    await deliver(bob, alice, await cipher(alice, bob).encrypt(Buffer.from('init')));
    await deliver(alice, bob, await cipher(bob, alice).encrypt(Buffer.from('ack')));
    const message = await cipher(alice, bob).encrypt(Buffer.from('messung'));
    const addr = alice.address.toString();
    const data = JSON.parse(bob.store.sessions.get(addr));
    const [realKey] = Object.keys(data._sessions);
    const real = data._sessions[realKey];
    real.indexInfo.used = 1;
    const sessions = match ? { [realKey]: real } : {};
    for (let i = Object.keys(sessions).length; i < count; i++) {
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
    return { alice, bob, addr, message };
}

async function measure(fn) {
    // Der Monitor läuft schon vorher: sein erster Abtastwert setzt nur den
    // Startpunkt (auch reset() tut das, deshalb kein reset() vor der Messung).
    // Die Aufbau-Arbeit liegt vor enable() und wird nicht mitgemessen.
    const h = monitorEventLoopDelay({ resolution: 1 });
    h.enable();
    await new Promise((r) => setTimeout(r, 20));
    // Zusätzlich: Länge der einzelnen Abschnitte zwischen zwei Timer-Runden.
    const gaps = [];
    let last = process.hrtime.bigint();
    let sampling = true;
    const sample = () => {
        const now = process.hrtime.bigint();
        gaps.push(Number(now - last) / 1e6);
        last = now;
        if (sampling) {
            setTimeout(sample, 0);
        }
    };
    setTimeout(sample, 0);
    const t0 = process.hrtime.bigint();
    let outcome;
    try {
        await fn();
        outcome = 'ok';
    } catch (e) {
        outcome = e.message;
    }
    const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
    await new Promise((r) => setTimeout(r, 5));
    sampling = false;
    h.disable();
    const slices = gaps.filter((g) => g > 5);
    return { maxMs: h.max / 1e6, wallMs, outcome, slices };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (x) => x.toFixed(1).padStart(8);

async function main() {
    console.log(`@neelegirly/libsignal ${pkgVersion} · Node ${process.version} · ${rounds} Runden je Fall`);
    console.log('max. Blockade = monitorEventLoopDelay().max je Runde; Abschnitt = Median der Blockaden > 5 ms (nur ab 10 je Runde, sonst -)');
    console.log('Fall                                     | max. Blockade ms (Median / höchste) | Abschnitt ms | Dauer ms (Median) | Ergebnis');
    for (const count of [40, 2000]) {
        for (const match of [false, true]) {
            for (const mode of ['Schleife', 'Aufruf']) {
                const blocks = [];
                const walls = [];
                const slices = [];
                let outcome;
                for (let r = 0; r < rounds; r++) {
                    const sc = await scenario(count, match);
                    const c = cipher(sc.bob, sc.alice);
                    let fn;
                    if (mode === 'Schleife') {
                        // nur decryptWithSessions (die Schleife über die Sitzungen)
                        const record = await sc.bob.store.loadSession(sc.addr);
                        const sessions = record.getSessions();
                        fn = () => c.decryptWithSessions(sc.message.body, sessions);
                    } else {
                        // ganzer decryptWhisperMessage: laden, Schleife, ggf. speichern
                        fn = () => c.decryptWhisperMessage(sc.message.body);
                    }
                    const m = await measure(fn);
                    blocks.push(m.maxMs);
                    walls.push(m.wallMs);
                    slices.push(...m.slices);
                    outcome = m.outcome;
                }
                const label = `${String(count).padStart(4)} Sitzungen, ${match ? 'passende zuletzt' : 'keine passt     '}, ${mode.padEnd(8)}`;
                const slice = slices.length >= 10 * rounds ? fmt(median(slices)) : '       -';
                console.log(`${label} | ${fmt(median(blocks))} / ${fmt(Math.max(...blocks))}         | ${slice}     | ${fmt(median(walls))}          | ${outcome}`);
            }
        }
    }
    // Zum Einordnen: removeOldSessions() (läuft synchron in storeRecord) auf einem Datensatz dieser Größe.
    for (const count of [40, 2000]) {
        const sc = await scenario(count, true);
        const record = await sc.bob.store.loadSession(sc.addr);
        const t0 = process.hrtime.bigint();
        record.removeOldSessions();
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        console.log(`removeOldSessions bei ${count} Sitzungen: ${ms.toFixed(1)} ms am Stück (danach ${Object.keys(record.sessions).length})`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
