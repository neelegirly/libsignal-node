# @neelify/libsignal

`@neelify/libsignal` ist die kryptografische Signal-Abhaengigkeit fuer `@neelify/baileys`.
Das Paket stellt die noetigen Signal-Protokoll-Primitiven fuer Session-Aufbau und E2E-Verarbeitung bereit.

## Einsatzzweck

- kryptografische Basis fuer Schluessel-/Session-Operationen
- Verwendung als Abhaengigkeit in `@neelify/baileys`
- keine eigene Bot-API, sondern Core-Crypto-Baustein


## Kompatibilitaet

- `@neelify/libsignal`: `1.0.27`
- `@neelify/baileys`: `2.2.16`
- `@neelify/wa-api`: `1.7.15`

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
- Funktionierenden Crypto-Stand fuer den Neelify-Stack als Release-Basis uebernommen.

## Was veraendert wurde

- Dokumentation auf den praktischen Einsatzzweck als Crypto-Abhaengigkeit fokussiert.
- Installations- und Minimalbeispiel klar und knapp neu aufgebaut.
- Kompatibilitaetsbezug zu `@neelify/baileys`/`@neelify/wa-api` im Neelify-Stack klarer formuliert.

## Was neu ist

- Konsolidierte, release-taugliche README-Struktur.
- Klare Scope-Kommunikation fuer das `@neelify/...`-Namespace.
- Release auf Version `1.0.27` als stabile Basis fuer `@neelify/baileys@2.2.16`.
