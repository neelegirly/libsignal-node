'use strict';

// Kompletter Signal-Ablauf mit festen Schlüsseln (siehe test/helpers/kat.js):
// PreKey-Nachricht, Antwort, Folgenachricht. Die erwarteten Bytes wurden mit
// Stand 1.0.33 (protobufjs 7.5.0) erzeugt. Ändert sich Schlüsselableitung,
// Ratchet, Verschlüsselung, MAC oder das Protobuf-Format, schlägt dieser Test fehl.

const test = require('node:test');
const assert = require('node:assert/strict');
const curve = require('../src/curve');
const { runKat } = require('./helpers/kat');

const EXPECTED = {
    signedPreKeySignature:
        'ca77d425d92925a1535723d98fbee99935cfe76d0d6cd0cef48e023623158e0a' +
        'b06abac9f932d53f35c746b370d2602f5934e89360e62fe9c82f5446e6994685',
    m1: {
        type: 3,
        body:
            '33081f122105f321d767b0b8b38aa685cb053e77cbac1cb08c94b873ecc63010' +
            '36c816d0416d1a21052d95d697824fa69671eb440731764e837afa82ae5377ca' +
            'b3ce39a6e0d0b6260f2252330a2105b3b17bd65e24957a6c748eef5741b5a141' +
            '014441b26105cf310ba45374a7fc5410001800222031a879d63ee1f5bf83f0b1' +
            'eff56f644ef84246fe617da93d05ab8f748e7337f695b46e8e08198ce828d209' +
            '3007'
    },
    m1Plain: 'KAT: erste Nachricht',
    r1: {
        type: 1,
        body:
            '330a2105b1e74f7acfe3acc0a87695410dd6fbef7b34afea9a23201fdf9c8c8a' +
            '63112c2e100018002210d3946e2a3e474480032788019f11e393efee86b3e332' +
            'e188'
    },
    r1Plain: 'KAT: Antwort',
    m2: {
        type: 1,
        body:
            '330a2105fde8e40802a4e63096d7ccde020903af90437952dca43cbfa1bc7448' +
            'eae1142e100018002220d13b352ba42204e2984b700dc3236d84d7e93e434339' +
            '11a6bc85b8417c92f8337c27f89d647979b8'
    },
    m2Plain: 'KAT: Folgenachricht',
    ephemeralKeysUsed: 5
};

test('deterministischer Gesamtablauf ergibt exakt die eingefrorenen Bytes', async () => {
    const original = curve.generateKeyPair;
    const result = await runKat();
    assert.equal(curve.generateKeyPair, original, 'generateKeyPair muss wiederhergestellt sein');
    assert.deepEqual(result, EXPECTED);
});

test('deterministischer Gesamtablauf ist wiederholbar', async () => {
    assert.deepEqual(await runKat(), await runKat());
});
