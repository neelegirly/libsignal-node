import type * as cryptoModule from "./src/crypto";
import type * as curveModule from "./src/curve";

export interface E2ESession {
  registrationId: number;
  identityKey: Uint8Array;
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  preKey?: {
    keyId: number;
    publicKey: Uint8Array;
  };
}

export interface KeyPairType {
  pubKey: Buffer;
  privKey: Buffer;
}

export interface SignalStorage {
  loadSession(id: string): Promise<SessionRecord | null | undefined>;
  storeSession(id: string, session: SessionRecord): Promise<void>;
  isTrustedIdentity(
    identifier: string,
    identityKey: Uint8Array,
    direction?: number
  ): boolean | Promise<boolean>;
  loadPreKey(
    id: number | string
  ): Promise<KeyPairType | undefined>;
  removePreKey(id: number | string): void | Promise<void>;
  loadSignedPreKey(id?: number | string): KeyPairType | Promise<KeyPairType | undefined> | undefined;
  getOurRegistrationId(): Promise<number> | number;
  getOurIdentity(): KeyPairType | Promise<KeyPairType>;
}

export class ProtocolAddress {
  static from(encodedAddress: string): ProtocolAddress;
  constructor(name: string, deviceId: number);
  public id: string;
  public deviceId: number;
  public toString(): string;
  public is(other: ProtocolAddress): boolean;
}

export class SessionRecord {
  static deserialize(serialized: Uint8Array | object): SessionRecord;
  public serialize(): object;
  public haveOpenSession(): boolean;
}

export class SessionCipher {
  constructor(storage: SignalStorage, remoteAddress: ProtocolAddress);
  public decryptPreKeyWhisperMessage(ciphertext: Uint8Array): Promise<Buffer>;
  public decryptWhisperMessage(ciphertext: Uint8Array): Promise<Buffer>;
  public encrypt(data: Uint8Array): Promise<{ type: number; body: Buffer; registrationId: number }>;
}

export class SessionBuilder {
  constructor(storage: SignalStorage, remoteAddress: ProtocolAddress);
  public initOutgoing(session: E2ESession): Promise<void>;
}

export const crypto: typeof cryptoModule;
export const curve: typeof curveModule;
export const keyhelper: {
  generateIdentityKeyPair(): KeyPairType;
  generateRegistrationId(): number;
  generateSignedPreKey(
    identityKeyPair: KeyPairType,
    signedKeyId: number
  ): { keyId: number; keyPair: KeyPairType; signature: Buffer };
  generatePreKey(keyId: number): { keyId: number; keyPair: KeyPairType };
};

export class SignalError extends Error {}
export class SessionError extends SignalError {}
export class MessageCounterError extends SessionError {}
export class PreKeyError extends SessionError {}
export class UntrustedIdentityKeyError extends SignalError {
  constructor(addr: string, identityKey: Uint8Array);
  public addr: string;
  public identityKey: Uint8Array;
}
