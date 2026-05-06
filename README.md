<div align="center">

# 🔐 @neelegirly/libsignal 🔐

### *Crypto Core fuer den Neelegirly Stack*  
### *Signal Sessions · Key Material · E2E Foundation*

[![npm](https://img.shields.io/npm/v/@neelegirly/libsignal?style=for-the-badge&color=ff69b4&logo=npm)](https://www.npmjs.com/package/@neelegirly/libsignal)
[![baileys](https://img.shields.io/badge/baileys-2.2.21-ff8fab?style=for-the-badge)](https://www.npmjs.com/package/@neelegirly/baileys)
[![wa-api](https://img.shields.io/badge/wa--api-1.8.6-f4a261?style=for-the-badge)](https://www.npmjs.com/package/@neelegirly/wa-api)

<p align="center">
	<img src="https://files.catbox.moe/z90ndt.jpeg" width="420" alt="Neelegirly libsignal hero" />
</p>

**🗝️ Release-Stack:** `@neelegirly/libsignal 1.0.30` · `@neelegirly/baileys 2.2.21` · `@neelegirly/wa-api 1.8.6`

</div>

`@neelegirly/libsignal` ist die kryptografische Signal-Abhaengigkeit fuer `@neelegirly/baileys` und damit indirekt auch fuer `@neelegirly/wa-api`.
Das Paket liefert den E2E-Kern fuer Session-Aufbau, Key-Verarbeitung und sichere Nachrichtenfluesse.

## ✨ Highlights

| Bereich | Beschreibung | Status |
| --- | --- | --- |
| 🔑 Key Material | zentrale Primitive fuer Session-/Schluessel-Operationen | ✅ |
| 🛡️ E2E Core | Basis fuer verschluesselte Nachrichten im Neelegirly-Stack | ✅ |
| 🧩 Stack-Kompatibel | sauberer Fit fuer `baileys` und `wa-api` | ✅ |
| 🎀 Klarer Scope | `@neelegirly/libsignal` als eindeutige Release-Basis | ✅ |

## 📦 Kompatibilitaet

- `@neelegirly/libsignal`: `1.0.30`
- `@neelegirly/baileys`: `2.2.21`
- `@neelegirly/wa-api`: `1.8.6`

## 🚀 Installation

```bash
npm install @neelegirly/libsignal@1.0.30 --save-exact
```

## ⚡ Minimalbeispiel

```js
const libsignal = require('@neelegirly/libsignal')

console.log('libsignal geladen:', typeof libsignal === 'object')
```

## 🩷 Scope und Rolle im Stack

- `@neelegirly/libsignal` = Crypto-Core
- `@neelegirly/baileys` = WhatsApp-Web-Layer
- `@neelegirly/wa-api` = Multi-Session-Wrapper

Damit bleibt der Aufbau im gesamten Neelegirly-Stack klar und release-sicher.

## 🔄 Release-Notizen

- WhiskeySockets/libsignal-node TypeScript-Definitionen uebernommen und auf die Neelegirly-API abgestimmt
- ProtocolAddress-Typen, Curve-Definitionen und Public-Key-Helfer sauber beschrieben
- Stack-Versionen auf `1.0.30 / 2.2.21 / 1.8.6` angehoben
- weiterhin fokussiert auf den stabilen Crypto-Einsatz ohne Bot-Wrapper-Ballast
