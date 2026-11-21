'use strict';

// Feste Testvektoren für Schlüsselableitung und symmetrische Primitive.
// HKDF wird zusätzlich gegen Node's eigene RFC-5869-Implementierung (crypto.hkdfSync)
// geprüft; die eingefrorenen Werte wurden mit Stand 1.0.33 erzeugt und dienen dazu,
// dass jede spätere Änderung sofort auffällt.

const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('crypto');
const { crypto } = require('..');

const ZERO_SALT = Buffer.alloc(32);
const IKM = nodeCrypto.createHash('sha256').update('ikm').digest();

test('deriveSecrets entspricht HKDF-SHA256 (RFC 5869) für 1 bis 3 Blöcke', () => {
    const inputs = [
        [Buffer.alloc(22, 0x0b), Buffer.from([...Array(32).keys()]), Buffer.from('WhisperText')],
        [IKM, ZERO_SALT, Buffer.from('WhisperRatchet')],
        [Buffer.alloc(0), ZERO_SALT, Buffer.alloc(0)]
    ];
    for (const [ikm, salt, info] of inputs) {
        for (const chunks of [1, 2, 3]) {
            const ours = Buffer.concat(crypto.deriveSecrets(ikm, salt, info, chunks));
            const ref = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, info, 32 * chunks));
            assert.deepEqual(ours, ref, `chunks=${chunks} info=${info}`);
        }
    }
});

test('deriveSecrets: eingefrorene Vektoren der Signal-Info-Strings', () => {
    const v = (info, chunks) => crypto.deriveSecrets(IKM, ZERO_SALT, Buffer.from(info), chunks).map((b) => b.toString('hex'));
    assert.deepEqual(v('WhisperText', 3), [
        'f9e135dccb19a05f0555945ba354381a312d7d241661d8d8da865f0b8bc5f5e8',
        '56a18e4fed3d6d61ebe480c4584cda565c82195e8d3aae12b46dc1e932d7b214',
        'fa481c23a9bc267e525856206c9958305f0c61bb9d1a8d49ec168788ddebe948'
    ]);
    assert.deepEqual(v('WhisperRatchet', 2), [
        '9b9dd834d61393233c47c953833232bd2a8a0394bd5c296c2a5c50d363fd1b37',
        '10f7d36d66a1c6ccc9ba0edcef5e2f56d5dd756246b0b422b55f355b6c19520d'
    ]);
    assert.deepEqual(v('WhisperMessageKeys', 3), [
        '560427d83a27dd86a396c26896cfd962d78a501167995d8bba7e1bb613b5f26f',
        '75b097056029737713f69ebd08aaf097ad4baca1640fb56e396d1d3b67a7cf30',
        'a33971c782f2d42156caf27c41b3e782c3bf745ab75a5137308aaad0ba9127f6'
    ]);
    // Standard ist 3 Blöcke.
    assert.equal(crypto.deriveSecrets(IKM, ZERO_SALT, Buffer.from('WhisperText')).length, 3);
});

test('deriveSecrets lehnt falsche Eingaben ab', () => {
    assert.throws(() => crypto.deriveSecrets(IKM, Buffer.alloc(16), Buffer.from('x')), /salt of incorrect length/);
    assert.throws(() => crypto.deriveSecrets(IKM, ZERO_SALT, Buffer.from('x'), 4));
    assert.throws(() => crypto.deriveSecrets('kein Buffer', ZERO_SALT, Buffer.from('x')), TypeError);
});

test('AES-256-CBC: fester Vektor und Hin-/Rückweg', () => {
    const key = Buffer.alloc(32, 0x11);
    const iv = Buffer.alloc(16, 0x22);
    const plain = Buffer.from('Neelegirly libsignal AES-CBC');
    const ct = crypto.encrypt(key, plain, iv);
    assert.equal(ct.toString('hex'), '6b7257bdfdf615ffa117ae306681bcf0bcccb5c28a0b1094a90e5a1b23c84b53');
    assert.deepEqual(crypto.decrypt(key, ct, iv), plain);
    assert.throws(() => crypto.decrypt(Buffer.alloc(32, 0x12), ct, iv), 'falscher Schlüssel -> Padding-Fehler');
});

test('HMAC-SHA256 und verifyMAC', () => {
    const key = Buffer.alloc(32, 0x11);
    const data = Buffer.from('mac-input');
    const mac = crypto.calculateMAC(key, data);
    assert.equal(mac.toString('hex'), 'cd37fb886903abe264c14d4cbe1aa624221b2aa154fc310d5aab7f0c7b1fa192');
    assert.doesNotThrow(() => crypto.verifyMAC(data, key, mac.slice(0, 8), 8));
    const bad = Buffer.from(mac.slice(0, 8));
    bad[0] ^= 1;
    assert.throws(() => crypto.verifyMAC(data, key, bad, 8), /^Error: Bad MAC$/);
    assert.throws(() => crypto.verifyMAC(data, key, mac.slice(0, 7), 8), /Bad MAC length/);
});

test('hash ist SHA-512', () => {
    const data = Buffer.from('abc');
    assert.deepEqual(crypto.hash(data), nodeCrypto.createHash('sha512').update(data).digest());
});
