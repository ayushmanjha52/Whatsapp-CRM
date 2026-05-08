export const API_BASE_URL: string = (import.meta as any).env?.VITE_API_BASE_URL || ""

export function apiUrl(path: string): string {
  return API_BASE_URL ? API_BASE_URL.replace(/\/$/, "") + path : path
}

export const EXTRA_HEADERS: Record<string, string> = ((import.meta as any).env?.VITE_NGROK === "1") ? { "ngrok-skip-browser-warning": "true" } : {}

