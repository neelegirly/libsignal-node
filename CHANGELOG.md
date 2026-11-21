# Changelog

## v1.0.34

### 📦 Dependencies

- `protobufjs` is no longer pinned to exactly `7.5.0`; the range is now `^7.6.5`.
  - Lets npm share one `protobufjs` copy with `@neelegirly/baileys` (which declares `^7.2.4`)
    instead of installing a second copy just for libsignal.
  - The lower bound `7.6.5` is the first release without open npm audit advisories
    (`7.5.0` was affected by 12, including GHSA-xq3m-2v4x-88gg (critical) and
    GHSA-685m-2w69-288q (unbounded recursion while decoding)).
  - Lockfile now resolves `protobufjs@7.6.6`; `@protobufjs/inquire` is no longer needed.
- `curve25519-js` unchanged (`^0.0.4`).

### 🧪 Tests

- `npm test` now runs real Signal tests with `node --test` (42 tests) in addition to the syntax checks:
  key pairs, X25519 agreement (RFC 7748 vectors), signatures (valid/invalid), HKDF against
  Node's RFC 5869 implementation, session setup with PreKeyBundle, first PreKey message,
  replies and follow-ups, out-of-order delivery, restoring stored sessions, and defined errors
  for wrong keys, corrupted, replayed or malformed messages.
- A deterministic end-to-end known-answer test pins the exact message bytes, so any change in key
  derivation, ratchet, encryption, MAC or the protobuf wire format is noticed immediately.
  The bytes are identical with protobufjs 7.5.0, 7.6.5 and 7.6.6.

### 🔐 Crypto

- **No change to any crypto or session code** (`src/` is untouched).
- Two existing upstream behaviours (libsignal-node) are now pinned by tests and documented,
  not changed: `initOutgoing` does not verify the signed pre key signature (`isInit = true`),
  and a failed decrypt attempt can modify another session in the same record (pinned by a
  test in `test/session.test.js`).

## v1.0.33

### 🔐 Decrypt diagnostics (additive, behind a flag)

- Added structured decrypt-failure classification inside `decryptWithSessions`
  (`session_mismatch` / `already_decrypted` / `possible_corruption`), additive and
  rate-limited, gated behind `ONIMAI_LOG_SIGNAL_DECRYPT_WARN=1`.
- **No behavioural change**: nothing is deleted or reset. Multi-session decrypt and the
  existing Bad-MAC "try the next session" path stay intact — a Bad MAC across several
  sessions is a normal mismatch, not corruption.
- Helps distinguish benign session mismatch / duplicate delivery (already decrypted)
  from a genuine single-session corruption case.

## v1.0.32-ecosystem-clean

### 💖 Neelegirly Ecosystem Clean Stability Update

- Removed workspace/core confusion from documentation.
- Clarified the 4-package architecture.
- Clarified that PM2 only runs the app.
- Clarified that WA-API handles sessions internally.
- Improved beginner-facing usage documentation.
