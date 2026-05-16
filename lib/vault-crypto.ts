type VaultPayload = {
  version: 1
  alg: "AES-GCM"
  kdf: "PBKDF2-SHA256"
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

async function deriveVaultKey(releaseCode: string, owner: string, primaryBeneficiary: string) {
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
      salt: encoder.encode("silentvault-release-payload"),
      iterations: 210_000,
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
  const key = await deriveVaultKey(releaseCode, owner, primaryBeneficiary)
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret))

  const payload: VaultPayload = {
    version: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
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
  if (payload.version !== 1 || payload.alg !== "AES-GCM") {
    throw new Error("Unsupported vault payload format")
  }

  const key = await deriveVaultKey(releaseCode, owner, primaryBeneficiary)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  )

  return decoder.decode(decrypted)
}

export function makeReleaseCode() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0]
  return String(100000 + (random % 900000))
}
