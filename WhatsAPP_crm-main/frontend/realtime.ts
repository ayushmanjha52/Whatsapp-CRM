import { io, Socket } from "socket.io-client"
import { API_BASE_URL } from "./config"

export type InboxEvent = { event: string; wa_id?: string; message?: any; error?: any }
export type PipelineEvent = { event: string; deal?: any; deal_id?: number }

let sharedSocket: Socket | null = null
let inboxHandler: ((e: InboxEvent) => void) | null = null
let pipelineHandler: ((e: PipelineEvent) => void) | null = null

async function ensureConnection(getUserId: () => Promise<string>) {
  if (sharedSocket?.connected) return

  const userId = await getUserId()
  if (!userId) {
    console.warn("[Realtime] No user ID, skipping connection")
    return
  }

  const url = API_BASE_URL || window.location.origin

  console.info("[Realtime] Connecting to Socket.IO", { url, userId })

  sharedSocket = io(url, {
    path: "/socket.io/",
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  })

  sharedSocket.on("connect", () => {
    console.info("[Realtime] Socket.IO connected", { socketId: sharedSocket?.id, userId })
  })

  sharedSocket.on("disconnect", (reason) => {
    console.warn("[Realtime] Socket.IO disconnected", { reason })
  })

  sharedSocket.on("connect_error", (error) => {
    console.error("[Realtime] Socket.IO connection error", { error: error.message })
  })

  // Listen for all events from the server
  sharedSocket.on("event", (data: any) => {
    const event = data?.event || ""
    console.info("[Realtime] Event received", { event, data })

    // Route to appropriate handler based on event type
    // Pipeline events go to both handlers (for bidirectional sync)
    if (event.startsWith("deal_")) {
      if (pipelineHandler) {
        pipelineHandler(data as PipelineEvent)
      }
      if (inboxHandler) {
        inboxHandler(data as InboxEvent)
      }
    } else if (inboxHandler) {
      inboxHandler(data as InboxEvent)
    }
  })
}

export function connectInboxEvents(
  getUserId: () => Promise<string>,
  onEvent: (e: InboxEvent) => void
): { disconnect: () => void } {
  inboxHandler = onEvent
  ensureConnection(getUserId)

  return {
    disconnect: () => {
      inboxHandler = null
      if (!pipelineHandler && sharedSocket) {
        console.info("[Realtime] Disconnecting Socket.IO (no handlers)")
        sharedSocket.disconnect()
        sharedSocket = null
      }
    }
  }
}

export function connectPipelineEvents(
  getUserId: () => Promise<string>,
  onEvent: (e: PipelineEvent) => void
): { disconnect: () => void } {
  pipelineHandler = onEvent
  ensureConnection(getUserId)

  return {
    disconnect: () => {
      pipelineHandler = null
      if (!inboxHandler && sharedSocket) {
        console.info("[Realtime] Disconnecting Socket.IO (no handlers)")
        sharedSocket.disconnect()
        sharedSocket = null
      }
    }
  }
}
