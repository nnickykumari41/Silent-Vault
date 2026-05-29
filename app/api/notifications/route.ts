import { NextResponse } from "next/server"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export const runtime = "nodejs"

type NotificationRequest = {
  event: string
  vaultId: string
  message: string
  email?: string
  telegramChatId?: string
  webhookUrl?: string
}

function configuredSecret() {
  return process.env.SILENTVAULT_NOTIFICATION_SECRET
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase()
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address)
  const ipVersion = isIP(normalized)
  if (ipVersion === 0) return false

  const mappedIpv4 = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mappedIpv4) return isPrivateIpAddress(mappedIpv4[1])

  if (ipVersion === 4) {
    const [a, b] = normalized.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }

  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16)
  return (
    normalized === "::" ||
    normalized === "::1" ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xff00) === 0xff00
  )
}

function isAllowedWebhookHost(hostname: string) {
  const allowedHosts = (process.env.SILENTVAULT_ALLOWED_WEBHOOK_HOSTS || "")
    .split(",")
    .map((host) => normalizeHostname(host.trim()))
    .filter(Boolean)

  if (allowedHosts.length === 0) return false

  const normalized = normalizeHostname(hostname)
  return allowedHosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))
}

function isNotificationRequest(value: unknown): value is NotificationRequest {
  if (!value || typeof value !== "object") return false
  const payload = value as Partial<Record<keyof NotificationRequest, unknown>>
  return (
    typeof payload.event === "string" &&
    typeof payload.vaultId === "string" &&
    typeof payload.message === "string" &&
    (payload.email === undefined || typeof payload.email === "string") &&
    (payload.telegramChatId === undefined || typeof payload.telegramChatId === "string") &&
    (payload.webhookUrl === undefined || typeof payload.webhookUrl === "string")
  )
}

async function postJson(url: string, body: unknown, headers: HeadersInit = {}) {
  const timeout = AbortSignal.timeout(10_000)
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: timeout,
  })
}

async function isSafeWebhookUrl(value?: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    const hostname = normalizeHostname(url.hostname)
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return false
    if (!isAllowedWebhookHost(hostname)) return false
    if (isPrivateIpAddress(hostname)) return false

    const resolved = await lookup(hostname, { all: true, verbatim: true })
    if (resolved.length === 0) return false
    if (resolved.some((entry) => isPrivateIpAddress(entry.address))) return false

    return true
  } catch {
    return false
  }
}

async function sendEmail(payload: NotificationRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !payload.email) return { channel: "email", skipped: true }

  const response = await postJson(
    "https://api.resend.com/emails",
    {
      from: process.env.RESEND_FROM || "SilentVault <alerts@silentvault.local>",
      to: payload.email,
      subject: `SilentVault ${payload.event} for vault #${payload.vaultId}`,
      text: payload.message,
    },
    { Authorization: `Bearer ${apiKey}` },
  )

  return { channel: "email", ok: response.ok, status: response.status }
}

async function sendTelegram(payload: NotificationRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken || !payload.telegramChatId) return { channel: "telegram", skipped: true }

  const response = await postJson(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: payload.telegramChatId,
    text: payload.message,
    disable_web_page_preview: true,
  })

  return { channel: "telegram", ok: response.ok, status: response.status }
}

async function sendWebhook(payload: NotificationRequest) {
  if (!payload.webhookUrl) return { channel: "webhook", skipped: true }
  if (!(await isSafeWebhookUrl(payload.webhookUrl))) return { channel: "webhook", skipped: true, rejected: true }

  const response = await postJson(payload.webhookUrl!, {
    event: payload.event,
    vaultId: payload.vaultId,
    message: payload.message,
  })

  return { channel: "webhook", ok: response.ok, status: response.status }
}

export async function POST(request: Request) {
  const secret = configuredSecret()
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Notification relay secret is not configured" }, { status: 503 })
  }

  if (request.headers.get("x-silentvault-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized notification relay request" }, { status: 401 })
  }

  let rawPayload: unknown
  try {
    rawPayload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Notification payload must be valid JSON" }, { status: 400 })
  }

  if (!isNotificationRequest(rawPayload)) {
    return NextResponse.json({ ok: false, error: "Invalid notification payload shape" }, { status: 400 })
  }

  const payload = rawPayload
  if (!payload.event.trim() || !payload.vaultId.trim() || !payload.message.trim()) {
    return NextResponse.json({ ok: false, error: "event, vaultId, and message are required" }, { status: 400 })
  }
  if (payload.message.length > 2_000 || payload.event.length > 80 || payload.vaultId.length > 80) {
    return NextResponse.json({ ok: false, error: "Notification payload is too large" }, { status: 400 })
  }

  const settled = await Promise.allSettled([sendEmail(payload), sendTelegram(payload), sendWebhook(payload)])
  const results = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : { channel: ["email", "telegram", "webhook"][index], ok: false, error: result.reason?.message || "send failed" },
  )
  return NextResponse.json({ ok: true, results })
}
