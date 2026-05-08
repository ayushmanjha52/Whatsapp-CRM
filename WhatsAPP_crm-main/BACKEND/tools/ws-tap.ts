import WebSocket from "ws"
import * as readline from "readline"

function arg(name: string): string { 
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i+1] || "") : "" 
}

let API = arg("--api") || process.env.API_BASE_URL || "http://localhost:4000"
let USER_ID = arg("--user") || process.env.USER_ID || ""
let ACCESS_TOKEN = arg("--token") || process.env.SB_ACCESS_TOKEN || ""

async function ensureInput() {
  if (USER_ID && ACCESS_TOKEN) return
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, ans => resolve(ans.trim())))
  if (!API) API = await ask(`API base URL [http://localhost:4000]: `) || "http://localhost:4000"
  if (!USER_ID) USER_ID = await ask(`Enter USER_ID: `)
  if (!ACCESS_TOKEN) ACCESS_TOKEN = await ask(`Enter ACCESS_TOKEN: `)
  rl.close()
}

async function main() {
  await ensureInput()
  
  if (!USER_ID || !ACCESS_TOKEN) {
    console.log(JSON.stringify({ 
      error: "missing_input", 
      usage: "bun run ws-tap.ts --user <id> --token <access>",
      example: "bun run ws-tap.ts --user 315eea3a-... --token eyJ...",
      note: "You can also set API with --api http://localhost:4000" 
    }))
    process.exit(1)
  }

  const base = new URL("/", API)
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:"
  base.searchParams.set("channel", `tenant:${USER_ID}:inbox`)
  base.searchParams.set("token", ACCESS_TOKEN)
  
  console.log(JSON.stringify({ 
    event: "connecting", 
    url: base.toString().replace(ACCESS_TOKEN, "***TOKEN***"),
    timestamp: new Date().toISOString()
  }))

  const ws = new WebSocket(base.toString(), { 
    headers: { 
      Authorization: `Bearer ${ACCESS_TOKEN}` 
    },
    // Add handshake timeout
    handshakeTimeout: 10000
  })

  let pingInterval: NodeJS.Timeout | null = null
  let isConnected = false

  ws.on('open', () => {
    isConnected = true
    console.log(JSON.stringify({ 
      event: "ws_open", 
      timestamp: new Date().toISOString(),
      status: "Connection established successfully"
    }))
    
    // Start ping interval to keep connection alive
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping()
          console.log(JSON.stringify({ 
            event: "ping_sent", 
            timestamp: new Date().toISOString() 
          }))
        } catch (err) {
          console.log(JSON.stringify({ 
            event: "ping_error", 
            error: (err as any)?.message || String(err),
            timestamp: new Date().toISOString()
          }))
        }
      }
    }, 30000)
    
    console.log(JSON.stringify({ 
      event: "listening", 
      message: "Waiting for messages... (Press Ctrl+C to exit)",
      timestamp: new Date().toISOString()
    }))
  })

  ws.on('pong', () => {
    console.log(JSON.stringify({ 
      event: "pong_received", 
      timestamp: new Date().toISOString() 
    }))
  })

  ws.on('close', (code, reason) => {
    isConnected = false
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
    
    const closeReasons: Record<number, string> = {
      1000: "Normal closure",
      1001: "Going away",
      1002: "Protocol error",
      1003: "Unsupported data",
      1006: "Abnormal closure (connection lost)",
      1007: "Invalid frame payload",
      1008: "Policy violation",
      1009: "Message too big",
      1011: "Server error",
      1015: "TLS handshake failure"
    }
    
    console.log(JSON.stringify({ 
      event: "ws_close", 
      code, 
      reason: reason.toString() || closeReasons[code] || "Unknown",
      timestamp: new Date().toISOString(),
      was_connected: isConnected
    }))
    
    if (code === 1006) {
      console.log(JSON.stringify({
        event: "troubleshooting",
        message: "Connection closed abnormally. Possible causes:",
        causes: [
          "Server rejected the connection (check token validity)",
          "Network connectivity issue",
          "Server not running or not reachable",
          "WebSocket endpoint doesn't exist",
          "Authentication failed"
        ]
      }))
    }
    
    process.exit(code === 1000 ? 0 : 1)
  })

  ws.on('error', (err) => {
    console.log(JSON.stringify({ 
      event: "ws_error", 
      error: (err as any)?.message || String(err),
      code: (err as any)?.code,
      timestamp: new Date().toISOString()
    }))
  })

  ws.on('message', (data) => {
    try {
      const raw = data.toString()
      const obj = JSON.parse(raw)
      
      // Log simplified version
      const simple = { 
        event: obj?.event, 
        wa_id: obj?.wa_id, 
        message_id: obj?.message?.id, 
        type: obj?.message?.type, 
        timestamp: obj?.message?.timestamp 
      }
      
      console.log(JSON.stringify({ 
        event: "ws_message", 
        data: simple,
        received_at: new Date().toISOString()
      }))
      
      // Also log full message for debugging
      console.log(JSON.stringify({ 
        event: "ws_message_full", 
        data: obj,
        received_at: new Date().toISOString()
      }))
    } catch (err) {
      // If not JSON, log raw
      console.log(JSON.stringify({ 
        event: "ws_message_raw", 
        data: data.toString(),
        received_at: new Date().toISOString()
      }))
    }
  })

  // Handle process termination
  process.on('SIGINT', () => {
    console.log(JSON.stringify({ 
      event: "shutting_down", 
      timestamp: new Date().toISOString() 
    }))
    if (pingInterval) clearInterval(pingInterval)
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Client shutting down")
    }
    process.exit(0)
  })

  // Keep process alive
  process.stdin.resume()
}

main().catch(err => { 
  console.log(JSON.stringify({ 
    error: "fatal", 
    message: (err as any)?.message,
    stack: (err as any)?.stack,
    timestamp: new Date().toISOString()
  })) 
  process.exit(1)
})