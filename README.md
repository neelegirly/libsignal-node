<div align="center">

# @neelify/libsignal

### Signal-Protokoll Baustein fuer Node.js
### Crypto Primitives · Session Layer · PreKey Handling

[![Version](https://img.shields.io/badge/Version-1.0.15-ff69b4?style=for-the-badge&logo=github)](https://github.com/neelify/libsignal-node)
[![Companion](https://img.shields.io/badge/Companion-@neelify%2Fbaileys-9b59b6?style=for-the-badge)](https://www.npmjs.com/package/@neelify/baileys)
[![npm](https://img.shields.io/npm/v/@neelify/libsignal?style=for-the-badge&color=ff69b4&logo=npm)](https://www.npmjs.com/package/@neelify/libsignal)
[![License](https://img.shields.io/badge/License-MIT-ff69b4?style=for-the-badge)](LICENSE)

---

<p align="center">
  <img src="https://files.catbox.moe/phppor.JPG" width="720" alt="Neelify Header" />
</p>

[**Installation**](#installation) · [**Usage**](#usage) · [**Companion**](#companion-packages) · [**Changelog**](#changelog)

</div>

---

## Installation

```bash
npm install @neelify/libsignal@latest
```

```bash
yarn add @neelify/libsignal@latest
```

## Usage

```js
const libsignal = require('@neelify/libsignal')

console.log('libsignal loaded:', typeof libsignal === 'object' || typeof libsignal === 'function')
```

## Companion Packages

```bash
npm install @neelify/libsignal @neelify/baileys @neelify/wa-api
```

## Hinweise

- Basiert auf der bekannten JavaScript libsignal-protocol Linie.
- Einsatz als Kryptografie-Dependency fuer `@neelify/baileys`.
- Scope ist final auf `@neelify/*` vereinheitlicht.

## Changelog

### 1.0.15

- README bereinigt und konsolidiert
- Entfernt: lange numerierte Platzhalter-Bloecke
- Namespace-Doku auf `@neelify/*` fokussiert

### 1.0.14

- Namespace- und Publish-Vorbereitung

---

<div align="center">

Made with love by @neelify

</div>

