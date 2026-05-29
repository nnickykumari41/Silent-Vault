import { NextResponse } from "next/server"

export const runtime = "nodejs"

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export async function POST(request: Request) {
  const apiKey = process.env.PINATA_API_KEY
  const apiSecret = process.env.PINATA_API_SECRET
  const token = process.env.PINATA_JWT
  let headers: Record<string, string> | undefined
  if (apiKey && apiSecret) {
    headers = { pinata_api_key: apiKey, pinata_secret_api_key: apiSecret }
  } else if (token) {
    headers = { Authorization: `Bearer ${token}` }
  }

  if (!headers) {
    return NextResponse.json({ error: "Pinata upload is not configured." }, { status: 503 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file to pin." }, { status: 400 })
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "The selected file is empty." }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large for this upload route." }, { status: 413 })
  }

  const pinataForm = new FormData()
  pinataForm.append("file", file, file.name || "silentvault-encrypted-payload.bin")
  pinataForm.append(
    "pinataMetadata",
    JSON.stringify({
      name: file.name || "silentvault-encrypted-payload.bin",
      keyvalues: {
        app: "SilentVault",
        purpose: "encrypted-recovery-anchor",
      },
    }),
  )
  pinataForm.append("pinataOptions", JSON.stringify({ cidVersion: 1 }))

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers,
    body: pinataForm,
  })

  if (!response.ok) {
    const body = await response.text()
    return NextResponse.json(
      { error: body.slice(0, 240) || "Pinata rejected the upload." },
      { status: response.status },
    )
  }

  const result = await response.json()
  return NextResponse.json({
    cid: result.IpfsHash,
    ipfsUri: `ipfs://${result.IpfsHash}`,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
    size: result.PinSize,
    timestamp: result.Timestamp,
  })
}
