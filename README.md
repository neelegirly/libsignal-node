# @neelify/libsignal

`@neelify/libsignal` ist die kryptografische Signal-Abhaengigkeit fuer `@neelify/baileys`.
Das Paket stellt die noetigen Signal-Protokoll-Primitiven fuer Session-Aufbau und E2E-Verarbeitung bereit.

## Einsatzzweck

- kryptografische Basis fuer Schluessel-/Session-Operationen
- Verwendung als Abhaengigkeit in `@neelify/baileys`
- keine eigene Bot-API, sondern Core-Crypto-Baustein

## Installation

```bash
npm install @neelify/libsignal
```

## Minimalbeispiel

```js
const libsignal = require('@neelify/libsignal')

console.log('libsignal geladen:', typeof libsignal === 'object')
```

## Namespace und Scope

Der Paketname ist konsistent auf den Neelify-Scope gesetzt:

- `@neelify/libsignal`

Damit ist die Zuordnung im Neelify-Stack (`libsignal` -> `baileys` -> `wa-api`) eindeutig.

## Was ausgebessert wurde

- README sprachlich und strukturell bereinigt.
- Uneinheitliche Darstellung zu Scope/Namespace konsolidiert.
- Veraltete oder ueberladene Einleitungsabschnitte reduziert.

## Was veraendert wurde

- Dokumentation auf den praktischen Einsatzzweck als Crypto-Abhaengigkeit fokussiert.
- Installations- und Minimalbeispiel klar und knapp neu aufgebaut.
- Paketbezug zu `@neelify/baileys` explizit gemacht.

## Was neu ist

- Konsolidierte, release-taugliche README-Struktur.
- Klare Scope-Kommunikation fuer das `@neelify/...`-Namespace.
- Direkter Hinweis auf den technischen Einsatz im Baileys-Stack.
