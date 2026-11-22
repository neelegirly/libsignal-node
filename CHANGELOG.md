# Changelog

## v1.0.35

### ⏱️ Event loop: yield while trying many sessions

- **What:** `SessionCipher.decryptWithSessions` now lets the event loop run (`setImmediate`) whenever it has been
  trying sessions for more than 15 ms in one go (module constant `DECRYPT_YIELD_AFTER_MS`; no option, no environment
  variable, no new dependency).
- **Why:** a session record normally holds at most 40 sessions, because `removeOldSessions()` trims it on every
  store. If every decrypt attempt fails, the record is never stored and can grow to thousands of sessions. A single
  message that matches none of them ("Bad MAC" for each) then blocked the process for well over a second while
  every session was tried; timers, I/O and database clients stalled with it.
- **Unchanged:** sessions are tried in the same order and the first match wins (then `indexInfo.used` is set); the
  collected errors, the `ONIMAI_LOG_SIGNAL_DECRYPT_WARN` diagnostics and the final errors
  (`No matching sessions found for message` / `No sessions available`) are the same. No change to crypto, key
  derivation, MAC check or the stored session format. The pause is safe because `decryptWhisperMessage` runs
  inside the per-address `queueJob`, so nothing else can change that record while it waits. The PreKey path
  (`decryptPreKeyWhisperMessage`) looks up exactly one session by base key and has no such loop.

### 📏 Measured (Node 22, x86_64, `node bench/eventloop.js`, median of 5 runs)

Longest event loop blockage (`perf_hooks.monitorEventLoopDelay().max`) for one message that matches no session:

| Sessions in record | v1.0.34 | v1.0.35 |
| --- | --- | --- |
| 40 | 27–38 ms | 17–19 ms |
| 2000 | 1128–1184 ms | 26–41 ms |

With 2000 sessions the blockages between two pauses are 16 ms (median); the peaks above that are garbage
collection and, for the full call, loading/deserializing the 2000-session record before the loop. The total time
for the call stays the same (about 1.1 s for 2000 sessions on the test machine). Still blocking (unchanged, not part
of this release): if a message finally matches in such a huge record, `storeRecord()` → `removeOldSessions()` trims
it back to 40 in one synchronous step (about 0.9 s at 2000 sessions).

### 🧪 Tests

- New `test/eventloop.test.js` (5 tests, 47 in total): 2000 non-matching sessions plus one matching session at the
  end, and the "none matches" case. A `setImmediate` and a timer scheduled before the call run while sessions are
  still being tried; plaintext, stored sessions, error and diagnostics are identical to a run without pauses. Time is
  controlled through a stubbed `Date.now` (no real timing, no `mock.timers`). Also covered: no pause for a few fast
  attempts, a backwards clock jump, and `No sessions available`.
- All existing tests (including the known-answer test and fixed test vectors) are unchanged.

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
