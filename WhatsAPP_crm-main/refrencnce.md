import { readFileSync, writeFileSync } from "fs";

const port = Number(Bun.env.PORT ?? 3000);
const appId = Bun.env.META_APP_ID ?? "";
const appSecret = Bun.env.META_APP_SECRET ?? "";
const redirectUri = Bun.env.META_REDIRECT_URI ?? `http://localhost:${port}/auth/callback`;
const scopes = Bun.env.META_SCOPES ?? "whatsapp_business_management,whatsapp_business_messaging,business_management";

const TOKENS_PATH = Bun.env.TOKENS_PATH ?? "tokens.json";

type PhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
};

type TokenInfo = { 
  access_token: string; 
  name?: string;
  connected_at?: string;
  expires_at?: string;
  waba_id?: string;
  phone_numbers?: PhoneNumber[];
};
type TokenMap = Record<string, TokenInfo>;

function loadTokens(): TokenMap {
  try {
    const txt = readFileSync(TOKENS_PATH, "utf-8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function saveTokens(tokens: TokenMap) {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(";").forEach((p) => {
    const idx = p.indexOf("=");
    if (idx > -1) {
      const k = p.slice(0, idx).trim();
      const v = p.slice(idx + 1).trim();
      out[k] = v;
    }
  });
  return out;
}

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ==================== NEW FUNCTION 1: Register Phone Number ====================
async function registerPhoneNumber(token: string, phoneNumberId: string, pin: string = "123456"): Promise<boolean> {
  try {
    console.log(`📝 Registering phone number: ${phoneNumberId}`);
    
    const payload = {
      messaging_product: "whatsapp",
      pin: pin
    };
    
    const resp = await fetch(
      `https://graph.facebook.com/v24.0/${phoneNumberId}/register`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
    
    const data = await resp.json();
    
    if (!resp.ok) {
      console.error("❌ Failed to register phone number:", data);
      return false;
    }
    
    console.log("✅ Phone number registered successfully:", data);
    return true;
  } catch (e) {
    console.error("❌ Error registering phone number:", e);
    return false;
  }
}
// ==================== END NEW FUNCTION 1 ====================

async function fetchWABAId(token: string): Promise<string | null> {
  try {
    console.log("🔍 Fetching businesses...");
    const u = new URL("https://graph.facebook.com/v24.0/me/businesses");
    u.searchParams.set("access_token", token);
    u.searchParams.set("fields", "id,name");
    
    const resp = await fetch(u);
    const data = await resp.json();
    
    if (!resp.ok) {
      console.error("❌ Failed to fetch businesses:", data);
      return null;
    }
    
    console.log("✓ Businesses response:", data);
    
    if (!data.data || data.data.length === 0) {
      console.log("⚠️ No businesses found");
      return null;
    }
    
    for (const business of data.data) {
      console.log(`🔍 Checking business: ${business.name} (${business.id})`);
      
      const wabaUrl = new URL(`https://graph.facebook.com/v24.0/${business.id}/owned_whatsapp_business_accounts`);
      wabaUrl.searchParams.set("access_token", token);
      
      const wabaResp = await fetch(wabaUrl);
      const wabaData = await wabaResp.json();
      
      console.log(`  WABA response for ${business.name}:`, wabaData);
      
      if (wabaResp.ok && wabaData.data && wabaData.data.length > 0) {
        console.log(`✓ Found WABA: ${wabaData.data[0].id}`);
        return wabaData.data[0].id;
      }
    }
    
    console.log("⚠️ No WABA found in any business");
    return null;
  } catch (e) {
    console.error("❌ Error fetching WABA ID:", e);
    return null;
  }
}

async function fetchPhoneNumbers(token: string, wabaId: string): Promise<PhoneNumber[]> {
  try {
    console.log(`🔍 Fetching phone numbers for WABA: ${wabaId}`);
    const u = new URL(`https://graph.facebook.com/v24.0/${wabaId}/phone_numbers`);
    u.searchParams.set("access_token", token);
    u.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
    
    const resp = await fetch(u);
    const data = await resp.json();
    
    if (!resp.ok) {
      console.error("❌ Failed to fetch phone numbers:", data);
      return [];
    }
    
    console.log("✓ Phone numbers response:", data);
    return data.data || [];
  } catch (e) {
    console.error("❌ Error fetching phone numbers:", e);
    return [];
  }}

// ==================== NEW FUNCTION 2: Send Template Message ====================
async function sendWhatsAppTemplate(token: string, phoneNumberId: string, to: string): Promise<Response> {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "hello_world",
      language: {
        code: "en_US"
      }
    }
  };
  
  console.log("Sending template to WhatsApp API:", {
    phoneNumberId,
    to,
    payload
  });
  
  const resp = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  
  const txt = await resp.text();
  console.log("WhatsApp API response:", resp.status, txt);
  
  return new Response(txt, { 
    status: resp.status, 
    headers: { "Content-Type": "application/json" } 
  });
}
// ==================== END NEW FUNCTION 2 ====================

async function sendWhatsAppText(token: string, phoneNumberId: string, to: string, body: string): Promise<Response> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { 
      preview_url: false,
      body 
    }
  };
  
  console.log("Sending to WhatsApp API:", {
    phoneNumberId,
    to,
    payload
  });
  
  const resp = await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  
  const txt = await resp.text();
  console.log("WhatsApp API response:", resp.status, txt);
  
  return new Response(txt, { status: resp.status, headers: { "Content-Type": "application/json" } });
}

function html(body: string): Response {
  const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp Cloud API - SaaS</title>
  <style>
    * { 
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
      overflow: hidden;
    }
    
    body::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      animation: float 20s infinite ease-in-out;
    }
    
    @keyframes float {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      33% { transform: translate(30px, -30px) rotate(5deg); }
      66% { transform: translate(-20px, 20px) rotate(-5deg); }
    }
    
    .glass-container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 
        0 8px 32px 0 rgba(31, 38, 135, 0.37),
        inset 0 1px 0 0 rgba(255, 255, 255, 0.3);
      padding: 2.5rem;
      max-width: 520px;
      width: 100%;
      position: relative;
      z-index: 1;
      animation: slideUp 0.5s ease-out;
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .glass-header {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }
    
    h1 {
      color: #1a202c;
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      letter-spacing: -0.5px;
    }
    
    .emoji {
      display: inline-block;
      animation: wave 2s infinite;
      transform-origin: 70% 70%;
    }
    
    @keyframes wave {
      0%, 100% { transform: rotate(0deg); }
      10%, 30% { transform: rotate(14deg); }
      20%, 40% { transform: rotate(-8deg); }
      50% { transform: rotate(0deg); }
    }
    
    .subtitle {
      color: #718096;
      font-size: 0.95rem;
      margin: 0;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.65rem 1.25rem;
      border-radius: 12px;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .status-connected {
      color: #155724;
      border: 2px solid rgba(21, 87, 36, 0.2);
    }
    
    .status-disconnected {
      color: #721c24;
      border: 2px solid rgba(114, 28, 36, 0.2);
    }
    
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { 
        opacity: 1;
        transform: scale(1);
      }
      50% { 
        opacity: 0.6;
        transform: scale(0.9);
      }
    }
    
    .info-box {
      background: rgba(235, 248, 255, 0.3);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-left: 4px solid #4299e1;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
      font-size: 0.9rem;
      color: #1a365d;
      line-height: 1.6;
    }
    
    .phone-selector {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 2px solid rgba(102, 126, 234, 0.3);
      border-radius: 12px;
      padding: 0.85rem 1.25rem;
      width: 100%;
      font-size: 1rem;
      font-family: inherit;
      color: #2d3748;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-bottom: 1.5rem;
    }
    
    .phone-selector:hover {
      border-color: #667eea;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }
    
    .phone-selector:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
    }
    
    input, button {
      font-size: 1rem;
      padding: 0.85rem 1.25rem;
      border-radius: 12px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      width: 100%;
      font-family: inherit;
      transition: all 0.3s ease;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    
    input {
      color: #2d3748;
    }
    
    input:focus {
      outline: none;
      border-color: #667eea;
      background: rgba(255, 255, 255, 1);
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1), 0 4px 12px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }
    
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      position: relative;
      overflow: hidden;
    }
    
    button::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition: width 0.6s, height 0.6s;
    }
    
    button:hover::before {
      width: 300px;
      height: 300px;
    }
    
    button:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
    }
    
    button:active {
      transform: translateY(-1px);
    }
    
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    button span {
      position: relative;
      z-index: 1;
    }
    
    .btn-secondary {
      background: rgba(255, 255, 255, 0.9);
      color: #667eea;
      border: 2px solid rgba(102, 126, 234, 0.5);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }
    
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 1);
      border-color: #667eea;
    }
    
    form {
      margin-top: 1.5rem;
    }
    
    label {
      display: block;
      margin-bottom: 1.5rem;
      color: #f7fafc;
      font-weight: 600;
      font-size: 0.95rem;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    label input, label select {
      margin-top: 0.5rem;
    }
    
    code {
      background: rgba(45, 55, 72, 0.8);
      color: #fc8181;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-family: 'Monaco', 'Courier New', monospace;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    
    pre {
      background: rgba(45, 55, 72, 0.95);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #f7fafc;
      padding: 1.25rem;
      border-radius: 12px;
      overflow-x: auto;
      font-size: 0.85rem;
      margin-top: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3);
      max-height: 300px;
      line-height: 1.5;
    }
    
    .actions {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    
    .actions button {
      flex: 1;
    }
    
    a {
      text-decoration: none;
    }
    
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    @media (max-width: 600px) {
      .glass-container {
        padding: 1.75rem;
      }
      
      h1 {
        font-size: 1.5rem;
      }
      
      .actions {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="glass-container">
    ${body}
    <div class="info-box">
      <strong>📥 Latest webhook POST body</strong>
    </div>
    <pre id="webhookOut"></pre>
  </div>
  <script>
    const webhookEl = document.getElementById('webhookOut');
    try {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/events');
      ws.onopen = function() {
        console.log('[WS] Connected to server');
        webhookEl.textContent = '[WS] Connected - waiting for messages...\n';
      };
      ws.onmessage = function(event) {
        console.log('[Frontend] Received WS message:', event.data);
        try {
          const obj = JSON.parse(event.data);
          console.log('[Frontend] Parsed object:', obj);

          // Format WhatsApp message nicely
          if (obj.object === 'whatsapp_business_account' && obj.entry) {
            let hasMessages = false;
            let formattedMsg = 'New WhatsApp Event Received:\n\n';
            formattedMsg += '==================================================\n\n';

            for (const entry of obj.entry) {
              for (const change of entry.changes || []) {
                const value = change.value;

                // Check for incoming messages
                if (value.messages && value.messages.length > 0) {
                  hasMessages = true;
                  for (const msg of value.messages) {
                    const contact = value.contacts?.find(c => c.wa_id === msg.from);
                    const senderName = contact?.profile?.name || msg.from;
                    const timestamp = new Date(parseInt(msg.timestamp) * 1000).toLocaleString();
                    const phoneNumber = value.metadata?.display_phone_number;

                    formattedMsg += '[From] ' + senderName + ' (' + msg.from + ')\n';
                    formattedMsg += '[To] ' + phoneNumber + '\n';
                    formattedMsg += '[Time] ' + timestamp + '\n';
                    formattedMsg += '[Type] ' + msg.type + '\n\n';

                    if (msg.type === 'text' && msg.text) {
                      formattedMsg += '[Message]\n' + msg.text.body + '\n';
                    } else if (msg.type === 'image' && msg.image) {
                      formattedMsg += '[Image received]\n';
                      if (msg.image.caption) {
                        formattedMsg += 'Caption: ' + msg.image.caption + '\n';
                      }
                    } else if (msg.type === 'document' && msg.document) {
                      formattedMsg += '[Document] ' + (msg.document.filename || 'Document') + '\n';
                    } else if (msg.type === 'audio' && msg.audio) {
                      formattedMsg += '[Audio message]\n';
                    } else if (msg.type === 'video' && msg.video) {
                      formattedMsg += '[Video message]\n';
                      if (msg.video.caption) {
                        formattedMsg += 'Caption: ' + msg.video.caption + '\n';
                      }
                    } else if (msg.location && msg.location) {
                      formattedMsg += '[Location] ' + (msg.location.name || 'Location shared') + '\n';
                    }

                    formattedMsg += '\n==================================================\n';
                  }
                }

                // Check for status updates (delivery receipts, etc.)
                if (value.statuses && value.statuses.length > 0 && !hasMessages) {
                  for (const status of value.statuses) {
                    const timestamp = new Date(parseInt(status.timestamp) * 1000).toLocaleString();
                    formattedMsg += '[Message Status Update]\n';
                    formattedMsg += '[ID] ' + status.id + '\n';
                    formattedMsg += '[Recipient] ' + status.recipient_id + '\n';
                    formattedMsg += '[Status] ' + status.status.toUpperCase() + '\n';
                    formattedMsg += '[Time] ' + timestamp + '\n';
                    formattedMsg += '\n==================================================\n';
                  }
                  hasMessages = true;
                }
              }
            }

            if (hasMessages) {
              webhookEl.textContent = formattedMsg;
              console.log('[Frontend] Updated display with:', formattedMsg);
            } else {
              webhookEl.textContent = 'Unknown webhook event type\n' + JSON.stringify(obj, null, 2);
            }
          } else {
            webhookEl.textContent = 'Webhook POST body: ' + JSON.stringify(obj, null, 2);
          }
        } catch (err) {
          console.error('[Frontend] Error parsing:', err);
          webhookEl.textContent = 'Webhook POST body: ' + event.data;
        }
      };
      ws.onerror = function(error) {
        console.error('[WS] Error:', error);
        webhookEl.textContent = '[WS] Error: ' + error;
      };
      ws.onclose = function() {
        console.log('[WS] Connection closed');
        webhookEl.textContent = '[WS] Connection closed - refresh page to reconnect';
      };
      console.log('[Frontend] WebSocket initializing...');
    } catch (err) {
      console.error('[Frontend] Failed to init WebSocket:', err);
    }
  </script>
</body>
</html>`;
  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function exchangeCodeForToken(code: string): Promise<{ access_token: string; token_type: string; expires_in?: number }> {
  const u = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  const resp = await fetch(u);
  if (!resp.ok) throw new Error("Failed to exchange code");
  return resp.json();
}

async function exchangeForLongLived(token: string): Promise<{ access_token: string; expires_in?: number }> {
  const u = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("fb_exchange_token", token);
  const resp = await fetch(u);
  if (!resp.ok) return { access_token: token };
  const j = await resp.json();
  return { access_token: j.access_token ?? token, expires_in: j.expires_in };
}

async function fetchMe(token: string): Promise<{ id: string; name?: string }> {
  const u = new URL("https://graph.facebook.com/v24.0/me");
  u.searchParams.set("fields", "id,name");
  u.searchParams.set("access_token", token);
  const resp = await fetch(u);
  if (!resp.ok) throw new Error("Failed to fetch user");
  return resp.json();
}

const wsClients = new Set<WebSocket>();
function wsBroadcast(data: string) {
  const clients = Array.from(wsClients);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch (e) {
      wsClients.delete(ws);
    }
  }
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const cookies = parseCookies(req.headers.get("cookie"));

    if (url.pathname === "/events") {
      const { socket, response } = Bun.serveWebSocket(req, {
        open(ws) {
          wsClients.add(ws);
          console.log('[WS] Client connected, total clients:', wsClients.size);
        },
        message(ws, message) {
          console.log('[WS] Received:', message);
        },
        close(ws) {
          wsClients.delete(ws);
          console.log('[WS] Client disconnected, total clients:', wsClients.size);
        },
        drain(ws) {
          console.log('[WS] WebSocket buffer drained');
        },
      });
      return response;
    }

    if (url.pathname === "/") {
      const tokens = loadTokens();
      const uid = cookies["session"];
      
      if (!uid || !tokens[uid]) {
        const body = `
          <div class="glass-header">
            <h1>WhatsApp Cloud API</h1>
            <p class="subtitle">Connect your Meta account to send WhatsApp messages</p>
          </div>
          <div class="status-badge status-disconnected">
            <span class="status-dot"></span>
            Not Connected
          </div>
          <div class="info-box">
            <strong>📋 This SaaS will automatically:</strong><br>
            • Fetch your WhatsApp Business Account<br>
            • Retrieve all connected phone numbers<br>
            • Let you send messages on your behalf
          </div>
          <a href="/auth/login">
            <button><span>🚀 Connect with Meta</span></button>
          </a>
        `;
        return html(body);
      }
      
      const tokenInfo = tokens[uid];
      const name = tokenInfo.name ?? "User";
      const connectedAt = tokenInfo.connected_at ? new Date(tokenInfo.connected_at).toLocaleString() : "Unknown";
      const phoneNumbers = tokenInfo.phone_numbers || [];
      
      const phoneOptions = phoneNumbers.map(p => 
        `<option value="${p.id}">${p.display_phone_number} (${p.verified_name})</option>`
      ).join('');
      
      // ==================== UPDATED HOME PAGE HTML ====================
      const body = `
        <div class="glass-header">
          <h1>Welcome, ${name}! <span class="emoji">👋</span></h1>
          <p class="subtitle">Your WhatsApp API is ready to use</p>
        </div>
        <div class="status-badge status-connected">
          <span class="status-dot"></span>
          Connected
        </div>
        <div class="info-box">
          <strong>🕐 Connected since:</strong> ${connectedAt}<br>
          <strong>📱 Available phone numbers:</strong> ${phoneNumbers.length}
        </div>
        
        ${phoneNumbers.length > 0 ? `
          <!-- NEW: Registration Button -->
          <button id="registerBtn" style="margin-bottom: 1rem; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);">
            <span>📝 Register Phone Number First</span>
          </button>
          
          <form id="sendForm">
            <label>
              📞 From Phone Number
              <select name="phoneNumberId" id="phoneSelect" class="phone-selector" required>
                ${phoneOptions}
              </select>
            </label>
            <label>
              📱 To Number (with country code)
              <input name="to" required placeholder="+919142845885" type="tel">
            </label>
            <label>
              💬 Message
              <input name="text" required placeholder="Hello from WhatsApp!">
            </label>
            <button type="submit"><span>Send Message 📤</span></button>
          </form>
          <pre id="out"></pre>
          
          <script>
            const registerBtn = document.getElementById('registerBtn');
            const phoneSelect = document.getElementById('phoneSelect');
            const o = document.getElementById('out');
            
            // NEW: Register phone number handler
            registerBtn.addEventListener('click', async () => {
              const phoneNumberId = phoneSelect.value;
              registerBtn.disabled = true;
              const origText = registerBtn.innerHTML;
              registerBtn.innerHTML = '<span class="loading"></span>';
              o.textContent = 'Registering phone number...';
              
              try {
                const r = await fetch('/api/register-phone', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phoneNumberId, pin: '123456' })
                });
                
                const data = await r.json();
                
                if (r.ok) {
                  o.textContent = '✅ Phone number registered successfully! You can now send messages.';
                  registerBtn.style.background = 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)';
                  registerBtn.innerHTML = '<span>✓ Registered!</span>';
                } else {
                  o.textContent = '⚠️ ' + (data.error || 'Registration failed') + '\\n' + (data.help || '');
                  registerBtn.disabled = false;
                  registerBtn.innerHTML = origText;
                }
              } catch (err) {
                o.textContent = '❌ Error: ' + err.message;
                registerBtn.disabled = false;
                registerBtn.innerHTML = origText;
              }
            });
            
            // Send message form
            const f = document.getElementById('sendForm');
            const btn = f.querySelector('button[type="submit"]');
            const btnText = btn.innerHTML;
            
            f.addEventListener('submit', async (e) => {
              e.preventDefault();
              btn.disabled = true;
              btn.innerHTML = '<span class="loading"></span>';
              o.textContent = 'Sending...';
              
              const d = new FormData(f);
              try {
                const r = await fetch('/api/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    phoneNumberId: d.get('phoneNumberId'),
                    to: d.get('to'),
                    text: d.get('text'),
                    useTemplate: true
                  })
                });
                const text = await r.text();
                
                if (r.ok) {
                  try {
                    const json = JSON.parse(text);
                    if (json.messages) {
                      o.textContent = '✅ Message sent successfully!\\n\\n' + JSON.stringify(json, null, 2);
                    } else {
                      o.textContent = text;
                    }
                  } catch {
                    o.textContent = text;
                  }
                } else {
                  o.textContent = '❌ Error: ' + text;
                }
              } catch (err) {
                o.textContent = '❌ Error: ' + err.message;
              } finally {
                btn.disabled = false;
                btn.innerHTML = btnText;
              }
            });
          </script>
        ` : `
          <div class="info-box" style="background: rgba(252, 129, 129, 0.2); border-left-color: #f56565; color: #742a2a;">
            <strong>⚠️ No phone numbers found</strong><br>
            Please add a phone number to your WhatsApp Business Account first.
          </div>
        `}
        
        <div class="actions">
          <a href="/me">
            <button class="btn-secondary"><span>🔐 Token Info</span></button>
          </a>
          <a href="/auth/logout">
            <button class="btn-secondary"><span>🚪 Disconnect</span></button>
          </a>
        </div>
      `;
      // ==================== END UPDATED HOME PAGE ====================
      return html(body);
    }

    if (url.pathname === "/auth/login") {
      const state = randomHex(16);
      const oauth = new URL("https://www.facebook.com/v24.0/dialog/oauth");
      oauth.searchParams.set("client_id", appId);
      oauth.searchParams.set("redirect_uri", redirectUri);
      oauth.searchParams.set("state", state);
      oauth.searchParams.set("response_type", "code");
      oauth.searchParams.set("scope", scopes);
      return new Response(null, {
        status: 302,
        headers: {
          Location: oauth.toString(),
          "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax`
        }
      });
    }

    if (url.pathname === "/auth/callback") {
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code");
      const stored = cookies["oauth_state"] ?? "";
      
      if (!code || !state || state !== stored) {
        return html(`
          <div class="glass-header">
            <h1>❌ Connection Failed</h1>
            <p class="subtitle">Invalid state or authorization code</p>
          </div>
          <a href="/">
            <button><span>🔄 Try Again</span></button>
          </a>
        `);
      }
      
      try {
        console.log("OAuth callback received");
        const t = await exchangeCodeForToken(code);
        console.log("✓ Short-lived token acquired");
        
        const ll = await exchangeForLongLived(t.access_token);
        console.log("✓ Exchanged for long-lived token");
        
        const me = await fetchMe(ll.access_token);
        console.log("✓ Fetched user:", me);
        
        const wabaId = await fetchWABAId(ll.access_token);
        console.log("✓ WABA ID:", wabaId);
        
        let phoneNumbers: PhoneNumber[] = [];
        if (wabaId) {
          phoneNumbers = await fetchPhoneNumbers(ll.access_token, wabaId);
          console.log("✓ Phone numbers:", phoneNumbers);
        }
        
        const tokens = loadTokens();
        const connectedAt = new Date().toISOString();
        const expiresAt = ll.expires_in ? new Date(Date.now() + ll.expires_in * 1000).toISOString() : undefined;
        
        tokens[me.id] = { 
          access_token: ll.access_token, 
          name: me.name,
          connected_at: connectedAt,
          expires_at: expiresAt,
          waba_id: wabaId || undefined,
          phone_numbers: phoneNumbers
        };
        saveTokens(tokens);
        console.log("✓ Saved token and phone numbers to", TOKENS_PATH);
        
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/",
            "Set-Cookie": `session=${me.id}; Path=/; HttpOnly; SameSite=Lax`
          }
        });
      } catch (e) {
        console.error("OAuth callback error", e);
        return html(`
          <div class="glass-header">
            <h1>❌ Connection Failed</h1>
            <p class="subtitle">An error occurred during authentication</p>
          </div>
          <pre>${String(e)}</pre>
          <a href="/">
            <button><span>🔄 Try Again</span></button>
          </a>
        `);
      }
    }

    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        }
      });
    }

    // ==================== NEW ENDPOINT 1: Register Phone ====================
    if (url.pathname === "/api/register-phone" && req.method === "POST") {
      const uid = cookies["session"];
      const tokens = loadTokens();
      
      if (!uid || !tokens[uid]) {
        return new Response(JSON.stringify({ error: "Not logged in" }), { 
          status: 401, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      const j = (await req.json()) as { phoneNumberId?: string; pin?: string };
      const phoneNumberId = String(j.phoneNumberId ?? "").trim();
      const pin = String(j.pin ?? "123456").trim();
      
      if (!phoneNumberId) {
        return new Response(JSON.stringify({ error: "Missing phoneNumberId" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      const registered = await registerPhoneNumber(tokens[uid].access_token, phoneNumberId, pin);
      
      if (registered) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Phone number registered successfully" 
        }), { 
          status: 200, 
          headers: { "Content-Type": "application/json" } 
        });
      } else {
        return new Response(JSON.stringify({ 
          error: "Failed to register phone number",
          help: "The number might already be registered, or there's a permission issue"
        }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        });
      }
    }
    // ==================== END NEW ENDPOINT 1 ====================

    // ==================== UPDATED ENDPOINT: Send Message ====================
    if (url.pathname === "/api/send" && req.method === "POST") {
      const uid = cookies["session"];
      const tokens = loadTokens();
      if (!uid || !tokens[uid]) {
        return new Response(JSON.stringify({ error: "Not logged in" }), { 
          status: 401, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      const j = (await req.json()) as { 
        phoneNumberId?: string; 
        to?: string; 
        text?: string;
        useTemplate?: boolean;
      };
      
      const phoneNumberId = String(j.phoneNumberId ?? "").trim();
      const to = String(j.to ?? "").trim();
      const text = String(j.text ?? "").trim();
      const useTemplate = j.useTemplate ?? true; // Default to template
      
      if (!phoneNumberId || !to) {
        return new Response(JSON.stringify({ error: "Missing phoneNumberId or to" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      // Use template method (recommended for testing)
      if (useTemplate) {
        return sendWhatsAppTemplate(tokens[uid].access_token, phoneNumberId, to);
      }
      
      // Use text method (requires 24hr window)
      if (!text) {
        return new Response(JSON.stringify({ error: "Missing text" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      
      return sendWhatsAppText(tokens[uid].access_token, phoneNumberId, to, text);
    }
    // ==================== END UPDATED ENDPOINT ====================

    if (url.pathname === "/me") {
      const uid = cookies["session"];
      const tokens = loadTokens();
      if (!uid || !tokens[uid]) {
        return html(`
          <div class="glass-header">
            <h1>🔒 No Session</h1>
            <p class="subtitle">You need to connect first</p>
          </div>
          <a href="/">
            <button><span>🏠 Go Home</span></button>
          </a>
        `);
      }
      const t = tokens[uid];
      const masked = t.access_token.slice(0, 12) + "..." + t.access_token.slice(-6);
      const connectedAt = t.connected_at ? new Date(t.connected_at).toLocaleString() : "Unknown";
      const expiresAt = t.expires_at ? new Date(t.expires_at).toLocaleString() : "N/A";
      
      const phoneNumbersList = (t.phone_numbers || []).map(p => 
        `<br>• <code>${p.id}</code> - ${p.display_phone_number} (${p.verified_name})`
      ).join('');
      
      return html(`
        <div class="glass-header">
          <h1>🔐 Token Information</h1>
          <p class="subtitle">Your connection details</p>
        </div>
        <div class="info-box">
          <strong>👤 User:</strong> ${t.name ?? "User"}<br>
          <strong>🔑 Token:</strong> <code>${masked}</code><br>
          <strong>🕐 Connected:</strong> ${connectedAt}<br>
          <strong>⏰ Expires:</strong> ${expiresAt}<br>
          <strong>💾 Storage:</strong> <code>${TOKENS_PATH}</code><br>
          <strong>🏢 WABA ID:</strong> <code>${t.waba_id || 'Not found'}</code><br>
          <strong>📱 Phone Numbers:</strong> ${phoneNumbersList || '<br>None found'}
        </div>
        <a href="/">
          <button><span>← Back to Home</span></button>
        </a>
      `);
    }

    if (url.pathname === "/webhook") {
      if (req.method === "GET") {
        const verifyToken = Bun.env.WHATSAPP_VERIFY_TOKEN ?? "";
        const mode = url.searchParams.get("hub.mode");
        const challenge = url.searchParams.get("hub.challenge");
        const token = url.searchParams.get("hub.verify_token");
        console.log("Webhook GET:", { mode, challenge, token, verifyToken });
        if (mode === "subscribe" && token === verifyToken && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      }
      if (req.method === "POST") {
        const body = await req.text();
        console.log("Webhook POST body (raw):", body);
        try {
          const parsed = JSON.parse(body);
          console.log("Webhook POST body (parsed):", parsed);
          console.log("📨 Message from:", parsed?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from);
          console.log("📝 Text:", parsed?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body);
        } catch (e) {
          console.log("Failed to parse JSON:", e);
        }
        wsBroadcast(body);
        console.log('[WS] Broadcast to', wsClients.size, 'clients');
        return new Response("", { status: 200 });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`✨ Server running on http://localhost:${port}`);
