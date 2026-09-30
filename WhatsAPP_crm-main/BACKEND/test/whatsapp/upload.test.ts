import { describe, it, expect, afterEach } from "bun:test"
import { uploadTemplateSample, GraphError } from "../../src/whatsapp/graph"

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

describe("uploadTemplateSample", () => {
  it("opens an upload session, sends the bytes and returns the handle", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      if (calls.length === 1) return new Response(JSON.stringify({ id: "upload:SESSION" }), { status: 200 })
      return new Response(JSON.stringify({ h: "4::HANDLE" }), { status: 200 })
    }) as any
    const h = await uploadTemplateSample("APP1", "TOKEN", { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "a.png" })
    expect(h).toBe("4::HANDLE")
    const first = new URL(calls[0]!.url)
    expect(first.pathname).toEndWith("/APP1/uploads")
    expect(first.searchParams.get("file_length")).toBe("3")
    expect(first.searchParams.get("file_type")).toBe("image/png")
    expect(calls[1]!.url).toEndWith("/upload:SESSION")
    expect((calls[1]!.init.headers as any).Authorization).toBe("OAuth TOKEN")
    expect((calls[1]!.init.headers as any).file_offset).toBe("0")
  })

  it("surfaces Graph errors", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "bad app", code: 100 } }), { status: 400 })) as any
    await expect(uploadTemplateSample("APP1", "T", { bytes: new Uint8Array([1]), mimeType: "image/png", fileName: "a" })).rejects.toBeInstanceOf(GraphError)
  })
})
