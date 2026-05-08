import { apiUrl, EXTRA_HEADERS } from "../config";

function getCookie(name: string): string | undefined {
  const v = document.cookie.split("; ").find((s) => s.startsWith(name + "="));
  return v ? decodeURIComponent(v.split("=")[1]) : undefined;
}

export async function getOAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(apiUrl("/api/whatsapp/oauth-url"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("oauth_url_failed");
  return res.json();
}

export interface OnboardingError {
  error: string
  message?: string
  phone_numbers?: string[]
}

export async function completeOnboarding(code: string, wabaId?: string): Promise<any> {
  const csrf = getCookie("csrf_token");
  const res = await fetch(apiUrl("/api/whatsapp/complete-onboarding"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf || "",
      ...EXTRA_HEADERS,
    },
    body: JSON.stringify({ code, waba_id: wabaId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as OnboardingError
    if (res.status === 409 && data.error === "phone_already_connected") {
      const err = new Error("This WhatsApp account is already connected to another user") as any
      err.code = "ALREADY_CONNECTED"
      err.phoneNumbers = data.phone_numbers
      throw err
    }
    throw new Error(data.error || "onboarding_failed")
  }
  return res.json();
}

export async function getCredentials(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/credentials"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("credentials_failed");
  return res.json();
}

export async function getNumbers(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/numbers"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("numbers_failed");
  return res.json();
}

export async function getTemplates(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/templates"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("templates_failed");
  return res.json();
}

export async function getVerification(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/verification"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("verification_failed");
  return res.json();
}

export async function getMessagesAnalytics(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/analytics/messages"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("analytics_messages_failed");
  return res.json();
}

export async function getTemplatesAnalytics(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/analytics/templates"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("analytics_templates_failed");
  return res.json();
}

export async function getWebhookStatus(): Promise<any> {
  const res = await fetch(apiUrl("/api/whatsapp/webhook/status"), {
    method: "GET",
    credentials: "include",
    headers: { ...EXTRA_HEADERS },
  });
  if (!res.ok) throw new Error("webhook_status_failed");
  return res.json();
}

export async function configWebhook(verifyToken: string, callbackUrl: string): Promise<any> {
  const csrf = getCookie("csrf_token");
  const res = await fetch(apiUrl("/api/whatsapp/webhook/config"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf || "",
      ...EXTRA_HEADERS,
    },
    body: JSON.stringify({ verify_token: verifyToken, callback_url: callbackUrl }),
  });
  if (!res.ok) throw new Error("webhook_config_failed");
  return res.json();
}

export async function disconnect(): Promise<any> {
  const csrf = getCookie("csrf_token");
  const res = await fetch(apiUrl("/api/whatsapp/disconnect"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf || "",
      ...EXTRA_HEADERS,
    },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error("disconnect_failed");
  return res.json();
}
