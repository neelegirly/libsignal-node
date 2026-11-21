'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const curveJs = require('curve25519-js');
const libsignal = require('..');

const { curve, keyhelper } = libsignal;
const hex = (s) => Buffer.from(s, 'hex');

// RFC 7748, section 6.1 (X25519 Diffie-Hellman test vectors).
const RFC7748 = {
    alicePriv: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
    alicePub: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
    bobPriv: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
    bobPub: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
    shared: '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742'
};

test('generateKeyPair liefert 32-Byte-Privatschlüssel und 33-Byte-Public-Key mit Typ-Byte 0x05', () => {
    const kp = curve.generateKeyPair();
    assert.ok(Buffer.isBuffer(kp.privKey));
    assert.ok(Buffer.isBuffer(kp.pubKey));
    assert.equal(kp.privKey.length, 32);
    assert.equal(kp.pubKey.length, 33);
    assert.equal(kp.pubKey[0], 0x05);
    assert.notDeepEqual(curve.generateKeyPair().privKey, kp.privKey, 'zwei Schlüsselpaare dürfen nicht gleich sein');
});

test('getPublicFromPrivateKey passt zum erzeugten Schlüsselpaar', () => {
    for (let i = 0; i < 5; i++) {
        const kp = curve.generateKeyPair();
        assert.deepEqual(curve.getPublicFromPrivateKey(kp.privKey), kp.pubKey);
    }
});

test('calculateAgreement ist beidseitig gleich', () => {
    const a = curve.generateKeyPair();
    const b = curve.generateKeyPair();
    const ab = curve.calculateAgreement(b.pubKey, a.privKey);
    const ba = curve.calculateAgreement(a.pubKey, b.privKey);
    assert.equal(ab.length, 32);
    assert.deepEqual(ab, ba);
    const c = curve.generateKeyPair();
    assert.notDeepEqual(curve.calculateAgreement(c.pubKey, a.privKey), ab, 'anderer Partner -> anderes Geheimnis');
});

test('X25519 nach RFC 7748 (feste Testvektoren)', () => {
    const alicePriv = hex(RFC7748.alicePriv);
    const bobPriv = hex(RFC7748.bobPriv);
    const alicePub = curve.getPublicFromPrivateKey(alicePriv);
    const bobPub = curve.getPublicFromPrivateKey(bobPriv);
    assert.equal(alicePub.toString('hex'), '05' + RFC7748.alicePub);
    assert.equal(bobPub.toString('hex'), '05' + RFC7748.bobPub);
    assert.equal(curve.calculateAgreement(bobPub, alicePriv).toString('hex'), RFC7748.shared);
    assert.equal(curve.calculateAgreement(alicePub, bobPriv).toString('hex'), RFC7748.shared);
    // Ausweichpfad (curve25519-js), falls nodeCrypto.diffieHellman fehlt: gleiches Ergebnis.
    assert.equal(Buffer.from(curveJs.sharedKey(alicePriv, hex(RFC7748.bobPub))).toString('hex'), RFC7748.shared);
});

test('Signatur: gültig wird akzeptiert, verändert/fremd wird abgelehnt', () => {
    const kp = curve.generateKeyPair();
    const other = curve.generateKeyPair();
    const msg = Buffer.from('signierte Nachricht');
    const sig = curve.calculateSignature(kp.privKey, msg);
    assert.equal(sig.length, 64);
    assert.equal(curve.verifySignature(kp.pubKey, msg, sig), true);

    const tamperedMsg = Buffer.from(msg);
    tamperedMsg[0] ^= 0x01;
    assert.equal(curve.verifySignature(kp.pubKey, tamperedMsg, sig), false, 'veränderte Nachricht');

    const tamperedSig = Buffer.from(sig);
    tamperedSig[10] ^= 0x01;
    assert.equal(curve.verifySignature(kp.pubKey, msg, tamperedSig), false, 'veränderte Signatur');

    assert.equal(curve.verifySignature(other.pubKey, msg, sig), false, 'falscher Schlüssel');
});

test('Signatur ist deterministisch (fester Testvektor)', () => {
    const priv = hex(RFC7748.alicePriv);
    const sig = curve.calculateSignature(priv, Buffer.from('msg'));
    assert.equal(sig.toString('hex'),
        '6c9488db9d370cf7a31f6bcb44756bba7b6e8ccf9a9c705e35feec420f6c3ef7' +
        '52e756c217325acb43e4e2d2dcef4173b530b2f4ab295f6c21b18da22b2fbe8f');
    assert.equal(curve.verifySignature(curve.getPublicFromPrivateKey(priv), Buffer.from('msg'), sig), true);
});

test('verifySignature mit isInit=true prüft nicht (Upstream-Verhalten, festgehalten)', () => {
    // SessionBuilder#initOutgoing ruft verifySignature(..., true) auf. Dieses Verhalten stammt
    // unverändert aus libsignal-node (WhiskeySockets). Der Test hält es fest, damit eine
    // Änderung bewusst entschieden wird und nicht unbemerkt passiert.
    const kp = curve.generateKeyPair();
    assert.equal(curve.verifySignature(kp.pubKey, Buffer.from('x'), Buffer.alloc(64), true), true);
    assert.equal(curve.verifySignature(kp.pubKey, Buffer.from('x'), Buffer.alloc(64), false), false);
});

test('ungültige Eingaben werfen definierte Fehler', () => {
    const kp = curve.generateKeyPair();
    const msg = Buffer.from('m');
    assert.throws(() => curve.calculateAgreement(kp.pubKey, Buffer.alloc(31)), /Incorrect private key length/);
    assert.throws(() => curve.calculateAgreement(kp.pubKey, undefined), /Undefined private key/);
    assert.throws(() => curve.calculateAgreement(kp.pubKey, new Uint8Array(32)), /Invalid private key type/);
    assert.throws(() => curve.calculateAgreement(Buffer.alloc(33, 0x07), kp.privKey), /Invalid public key/);
    assert.throws(() => curve.calculateAgreement(Buffer.alloc(20), kp.privKey), /Invalid public key/);
    assert.throws(() => curve.calculateSignature(kp.privKey, undefined), /Invalid message/);
    assert.throws(() => curve.verifySignature(kp.pubKey, msg, Buffer.alloc(63)), /Invalid signature/);
    assert.throws(() => curve.verifySignature(kp.pubKey, undefined, Buffer.alloc(64)), /Invalid message/);
});

test('keyhelper: RegistrationId, SignedPreKey und PreKey', () => {
    for (let i = 0; i < 50; i++) {
        const id = keyhelper.generateRegistrationId();
        assert.ok(Number.isInteger(id) && id >= 0 && id <= 0x3fff, `registrationId ${id}`);
    }
    const identity = keyhelper.generateIdentityKeyPair();
    const spk = keyhelper.generateSignedPreKey(identity, 5);
    assert.equal(spk.keyId, 5);
    assert.equal(curve.verifySignature(identity.pubKey, spk.keyPair.pubKey, spk.signature), true);
    const pk = keyhelper.generatePreKey(9);
    assert.equal(pk.keyId, 9);
    assert.equal(pk.keyPair.pubKey.length, 33);

    assert.throws(() => keyhelper.generateSignedPreKey(identity, -1), TypeError);
    assert.throws(() => keyhelper.generateSignedPreKey({ pubKey: identity.pubKey, privKey: Buffer.alloc(3) }, 1), TypeError);
    assert.throws(() => keyhelper.generatePreKey(1.5), TypeError);
});

test('ProtocolAddress: Kodierung und Vergleich', () => {
    const addr = new libsignal.ProtocolAddress('4915112345678', 2);
    assert.equal(addr.toString(), '4915112345678.2');
    const parsed = libsignal.ProtocolAddress.from('4915112345678.2');
    assert.ok(parsed.is(addr));
    assert.equal(parsed.is(new libsignal.ProtocolAddress('4915112345678', 3)), false);
    assert.throws(() => libsignal.ProtocolAddress.from('ohne-geraet'), /Invalid address encoding/);
    assert.throws(() => new libsignal.ProtocolAddress('a.b', 1), TypeError);
    assert.throws(() => new libsignal.ProtocolAddress('a', '1'), TypeError);
});
