<div align="center">

# @neelify/libsignal

### Signal Protocol Core for Node.js  
### Lightweight - Secure - Baileys Ready

[![Version](https://img.shields.io/badge/Version-1.0.18-ff69b4?style=for-the-badge&logo=github)](https://github.com/neelify/libsignal-node)
[![Baileys](https://img.shields.io/badge/Kompatibel_mit-@neelify/baileys_2.2.5-9b59b6?style=for-the-badge)](https://www.npmjs.com/package/@neelify/baileys)
[![npm](https://img.shields.io/npm/v/@neelify/libsignal?style=for-the-badge&color=ff69b4&logo=npm)](https://www.npmjs.com/package/@neelify/libsignal)
[![License](https://img.shields.io/badge/License-MIT-ff69b4?style=for-the-badge)](LICENSE)

<p align="center">
  <img src="https://files.catbox.moe/6np1ii.JPG" width="720" alt="Neelify Libsignal Header" />
</p>

<p align="center"><sub>2026 Glow-Up Edition - clean API docs - production-ready crypto core</sub></p>

| Package | Purpose | Status |
|---------|---------|--------|
| **@neelify/libsignal** | Signal protocol primitives for Node.js | Stable |

</div>

Signal protocol implementation for Node.js, based on
[libsignal-protocol-javascript](https://github.com/WhisperSystems/libsignal-protocol-javascript).
Part of the **@neelify** ecosystem and optimized for **@neelify/baileys** integrations.

---

## Quick Install

```bash
npm install @neelify/libsignal
```

## Quick Usage

```js
const libsignal = require('@neelify/libsignal')

console.log('libsignal loaded:', typeof libsignal === 'object')
```

## Overview
A ratcheting forward secrecy protocol that works in synchronous and
asynchronous messaging environments.


## PreKeys
This protocol uses a concept called 'PreKeys'. A PreKey is an ECPublicKey and
an associated unique ID which are stored together by a server. PreKeys can also
be signed.

At install time, clients generate a single signed PreKey, as well as a large
list of unsigned PreKeys, and transmit all of them to the server.


## Sessions
Signal Protocol is session-oriented. Clients establish a "session," which is
then used for all subsequent encrypt/decrypt operations. There is no need to
ever tear down a session once one has been established.

Sessions are established in one of two ways:

1. PreKeyBundles. A client that wishes to send a message to a recipient can
   establish a session by retrieving a PreKeyBundle for that recipient from the
   server.
2. PreKeySignalMessages. A client can receive a PreKeySignalMessage from a
   recipient and use it to establish a session.


## State
An established session encapsulates a lot of state between two clients. That
state is maintained in durable records which need to be kept for the life of
the session.

State is kept in the following places:

* Identity State. Clients will need to maintain the state of their own identity
  key pair, as well as identity keys received from other clients.
* PreKey State. Clients will need to maintain the state of their generated
  PreKeys.
* Signed PreKey States. Clients will need to maintain the state of their signed
  PreKeys.
* Session State. Clients will need to maintain the state of the sessions they
  have established.

---

<div align="center">

Copyright 2026 neelify

</div>
