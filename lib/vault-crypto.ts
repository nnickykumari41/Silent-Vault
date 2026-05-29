type VaultPayload = {
  version: 1 | 2
  alg: "AES-GCM"
  kdf: "PBKDF2-SHA256"
  salt?: string
  iv: string
  data: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToHex(bytes: Uint8Array) {
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer as ArrayBuffer
}

async function deriveVaultKey(releaseCode: string, owner: string, primaryBeneficiary: string, salt: Uint8Array) {
  const secretMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${releaseCode}:${owner.toLowerCase()}:${primaryBeneficiary.toLowerCase()}:silentvault-v1`),
    "PBKDF2",
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytesToArrayBuffer(salt),
      iterations: 600_000,
      hash: "SHA-256",
    },
    secretMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function encryptVaultPayload(
  secret: string,
  releaseCode: string,
  owner: string,
  primaryBeneficiary: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveVaultKey(releaseCode, owner, primaryBeneficiary, salt)
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret))

  const payload: VaultPayload = {
    version: 2,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }

  return JSON.stringify(payload)
}

export async function decryptVaultPayload(
  encryptedPayload: string,
  releaseCode: string,
  owner: string,
  primaryBeneficiary: string,
) {
  const payload = JSON.parse(encryptedPayload) as VaultPayload
  if ((payload.version !== 1 && payload.version !== 2) || payload.alg !== "AES-GCM") {
    throw new Error("Unsupported vault payload format")
  }

  const salt = payload.salt ? base64ToBytes(payload.salt) : encoder.encode("silentvault-release-payload")
  const key = await deriveVaultKey(releaseCode, owner, primaryBeneficiary, salt)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  )

  return decoder.decode(decrypted)
}

export function makeReleaseCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  bytes[0] = bytes[0] | 0x80
  let value = 0n
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte)
  }
  return value.toString()
}

export function makeBytes32Salt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256Bytes32(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return bytesToHex(new Uint8Array(digest))
}
