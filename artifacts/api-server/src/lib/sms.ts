import { logger } from "./logger";

// ── SMS delivery abstraction ────────────────────────────────────────────────
// OTP codes are delivered through a pluggable provider so the rest of the app
// never depends on a specific vendor. Until real SMS credentials are supplied,
// SMS_PROVIDER defaults to "console": the message (and OTP) is written to the
// server log so the whole flow can be developed and tested locally with zero
// cost. To go live, set SMS_PROVIDER + the matching credentials in the API
// environment — NO application code changes are required.
//
// Supported providers:
//   console      (default) — log only; never actually sends. Dev/test.
//   http         — generic HTTP gateway (most Egyptian gateways: SMSMisr,
//                  Victory Link, Connekio, Cequens, ...). Driven entirely by env:
//                    SMS_HTTP_URL      request URL, may contain {to}/{text}/{sender}
//                    SMS_HTTP_METHOD   "GET" (default) | "POST"
//                    SMS_HTTP_BODY     optional POST body template ({to}/{text}/{sender})
//                    SMS_HTTP_HEADERS  optional JSON object of extra headers
//                    SMS_SENDER_ID     approved sender name (NTRA-registered)
//   twilio       — Twilio REST API. Needs:
//                    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//                    TWILIO_FROM (a Twilio number or Messaging Service SID)

export type SmsResult = { ok: boolean; provider: string; error?: string };

const PROVIDER = (process.env.SMS_PROVIDER ?? "console").trim().toLowerCase();
const SENDER_ID = (process.env.SMS_SENDER_ID ?? "").trim();

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{${key}}`,
  );
}

async function sendViaConsole(to: string, text: string): Promise<SmsResult> {
  // The destination is intentionally NOT redacted here so local testing can read
  // the OTP straight from the log. The console provider must never be used in prod.
  logger.info({ to, text, sender: SENDER_ID || undefined }, "[sms:console] would send SMS");
  return { ok: true, provider: "console" };
}

async function sendViaHttp(to: string, text: string): Promise<SmsResult> {
  const urlTemplate = (process.env.SMS_HTTP_URL ?? "").trim();
  if (!urlTemplate) {
    logger.error("[sms:http] SMS_HTTP_URL is not set");
    return { ok: false, provider: "http", error: "SMS_HTTP_URL not configured" };
  }
  const method = (process.env.SMS_HTTP_METHOD ?? "GET").trim().toUpperCase();
  const vars = {
    to: encodeURIComponent(to),
    text: encodeURIComponent(text),
    sender: encodeURIComponent(SENDER_ID),
  };
  const url = fillTemplate(urlTemplate, vars);

  let headers: Record<string, string> = {};
  const rawHeaders = (process.env.SMS_HTTP_HEADERS ?? "").trim();
  if (rawHeaders) {
    try {
      headers = JSON.parse(rawHeaders) as Record<string, string>;
    } catch {
      logger.warn("[sms:http] SMS_HTTP_HEADERS is not valid JSON; ignoring");
    }
  }

  let body: string | undefined;
  const bodyTemplate = (process.env.SMS_HTTP_BODY ?? "").trim();
  if (method === "POST" && bodyTemplate) {
    // Body templates use the raw (un-encoded) values; the caller decides encoding
    // through SMS_HTTP_HEADERS (Content-Type).
    body = fillTemplate(bodyTemplate, { to, text, sender: SENDER_ID });
  }

  try {
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error({ status: res.status, detail: detail.slice(0, 500) }, "[sms:http] gateway error");
      return { ok: false, provider: "http", error: `HTTP ${res.status}` };
    }
    return { ok: true, provider: "http" };
  } catch (err) {
    logger.error({ err }, "[sms:http] request failed");
    return { ok: false, provider: "http", error: "request failed" };
  }
}

async function sendViaTwilio(to: string, text: string): Promise<SmsResult> {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const from = (process.env.TWILIO_FROM ?? "").trim();
  if (!accountSid || !authToken || !from) {
    logger.error("[sms:twilio] missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM");
    return { ok: false, provider: "twilio", error: "twilio not configured" };
  }
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, Body: text });
  // A Messaging Service SID (starts with "MG") goes in MessagingServiceSid; a plain
  // number goes in From.
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error({ status: res.status, detail: detail.slice(0, 500) }, "[sms:twilio] error");
      return { ok: false, provider: "twilio", error: `HTTP ${res.status}` };
    }
    return { ok: true, provider: "twilio" };
  } catch (err) {
    logger.error({ err }, "[sms:twilio] request failed");
    return { ok: false, provider: "twilio", error: "request failed" };
  }
}

/** Send an SMS through the configured provider. Returns a result rather than throwing. */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  switch (PROVIDER) {
    case "http":
      return sendViaHttp(to, text);
    case "twilio":
      return sendViaTwilio(to, text);
    case "console":
      return sendViaConsole(to, text);
    default:
      logger.error({ provider: PROVIDER }, "[sms] unknown SMS_PROVIDER; refusing to send");
      return { ok: false, provider: PROVIDER, error: "unknown provider" };
  }
}

/** True when a real (non-console) SMS provider is configured. Used to refuse to run with 2FA on in prod with no real sender. */
export function isRealSmsProviderConfigured(): boolean {
  return PROVIDER === "http" || PROVIDER === "twilio";
}

export function smsProviderName(): string {
  return PROVIDER;
}
