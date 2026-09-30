import { describe, it, expect, beforeAll } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const MIGRATIONS_DIR = join(import.meta.dir, "../../migrations")
const T = "tenant-1"

async function freshDb(): Promise<PGlite> {
  const db = new PGlite()
  for (const f of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    } catch (e: any) {
      throw new Error(`migration ${f} failed: ${e.message}`)
    }
  }
  await db.exec(`insert into tenants (id, name) values ('${T}', 'Acme')`)
  return db
}

async function one<T = any>(db: PGlite, sql: string, params: any[] = []): Promise<T> {
  const r = await db.query<T>(sql, params)
  return r.rows[0] as T
}

async function ingest(db: PGlite, waId: string, msgId: string, body: string, at: string, name = "Sam") {
  const r = await one<{ r: any }>(
    db,
    `select crm_ingest_inbound_message($1, $2, $3, $4, 'text', $5::jsonb, $6, $7::timestamptz, null) as r`,
    [T, waId, name, msgId, JSON.stringify({ id: msgId, type: "text", text: { body } }), body, at]
  )
  return r.r
}

async function outbound(db: PGlite, id: string, waId: string, at: string, campaignId: number | null = null) {
  await db.query(
    `insert into messages (id, tenant_id, thread_id, direction, type, payload_json, status, created_at, campaign_id)
     values ($1, $2, $3, 'out', 'text', '{}'::jsonb, 'queued', $4::timestamptz, $5)`,
    [id, T, waId, at, campaignId]
  )
}

describe("migrations", () => {
  let db: PGlite
  beforeAll(async () => { db = await freshDb() })

  it("apply cleanly and are re-runnable", async () => {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, "0017_crm_core.sql"), "utf8"))
    const r = await one<{ n: number }>(db, `select count(*)::int as n from information_schema.tables where table_name in ('tasks','tenant_members','message_status_pending')`)
    expect(r.n).toBe(3)
  })

  it("enables row level security on tenant tables", async () => {
    const r = await one<{ rls: boolean }>(db, `select relrowsecurity as rls from pg_class where relname = 'contacts'`)
    expect(r.rls).toBe(true)
  })
})

describe("crm_ingest_inbound_message", () => {
  let db: PGlite
  beforeAll(async () => { db = await freshDb() })

  it("creates an inbox contact with unread count and preview", async () => {
    const r = await ingest(db, "15550001", "wamid.A", "Hello", "2026-01-01T10:00:00Z")
    expect(r.inserted).toBe(true)
    const c = await one<any>(db, `select * from contacts where wa_id = '15550001'`)
    expect(c.display_name).toBe("Sam")
    expect(c.origin).toBe("inbox")
    expect(c.in_inbox).toBe(true)
    expect(c.unread_count).toBe(1)
    expect(c.last_message_preview).toBe("Hello")
    expect(c.phone_e164).toBe("+15550001")
  })

  it("ignores webhook retries of the same message", async () => {
    const r = await ingest(db, "15550001", "wamid.A", "Hello", "2026-01-01T10:00:00Z")
    expect(r.inserted).toBe(false)
    const c = await one<any>(db, `select unread_count from contacts where wa_id = '15550001'`)
    expect(c.unread_count).toBe(1)
  })

  it("keeps the newest preview when messages arrive out of order", async () => {
    await ingest(db, "15550001", "wamid.C", "Third", "2026-01-01T10:05:00Z")
    await ingest(db, "15550001", "wamid.B", "Second", "2026-01-01T10:02:00Z")
    const c = await one<any>(db, `select * from contacts where wa_id = '15550001'`)
    expect(c.unread_count).toBe(3)
    expect(c.last_message_preview).toBe("Third")
    expect(new Date(c.last_inbound_at).toISOString()).toBe("2026-01-01T10:05:00.000Z")
  })

  it("does not overwrite a name the team edited", async () => {
    await db.query(`update contacts set display_name = 'Sam (Acme)' where wa_id = '15550001'`)
    await ingest(db, "15550001", "wamid.D", "Hi", "2026-01-01T10:06:00Z", "Samuel")
    const c = await one<any>(db, `select display_name from contacts where wa_id = '15550001'`)
    expect(c.display_name).toBe("Sam (Acme)")
  })

  it("brings a broadcast-only contact into the inbox and attributes the reply", async () => {
    await db.query(`select crm_import_contacts($1, $2::jsonb, array['Leads'])`, [T, JSON.stringify([{ wa_id: "15559999", name: "Lead" }])])
    const lead = await one<any>(db, `select id, in_inbox from contacts where wa_id = '15559999'`)
    expect(lead.in_inbox).toBe(false)
    const camp = await one<any>(db, `insert into campaigns (tenant_id, name) values ($1, 'Promo') returning id`, [T])
    await db.query(
      `insert into campaign_messages (tenant_id, campaign_id, contact_id, status, sent_at) values ($1, $2, $3, 'delivered', '2026-01-02T09:00:00Z')`,
      [T, camp.id, lead.id]
    )
    const r = await ingest(db, "15559999", "wamid.R1", "Interested!", "2026-01-02T10:00:00Z")
    expect(Number(r.campaign_id)).toBe(Number(camp.id))
    const after = await one<any>(db, `select in_inbox from contacts where wa_id = '15559999'`)
    expect(after.in_inbox).toBe(true)
    const stats = await one<any>(db, `select * from campaign_stats where campaign_id = $1`, [camp.id])
    expect(stats.replied).toBe(1)
  })

  it("handles STOP / START opt-out keywords", async () => {
    await ingest(db, "15551111", "wamid.S1", " stop ", "2026-01-03T10:00:00Z")
    expect((await one<any>(db, `select opted_out from contacts where wa_id = '15551111'`)).opted_out).toBe(true)
    await ingest(db, "15551111", "wamid.S2", "START", "2026-01-03T10:01:00Z")
    expect((await one<any>(db, `select opted_out from contacts where wa_id = '15551111'`)).opted_out).toBe(false)
  })
})

describe("message delivery statuses", () => {
  let db: PGlite
  beforeAll(async () => {
    db = await freshDb()
    await ingest(db, "15552222", "wamid.IN", "Hi", "2026-01-01T09:00:00Z")
  })

  it("marks sent and only moves statuses forward", async () => {
    await outbound(db, "m1", "15552222", "2026-01-01T09:01:00Z")
    const sent = await one<any>(db, `select crm_mark_message_sent('m1', 'wamid.OUT1') as r`)
    expect(sent.r.status).toBe("sent")
    await db.query(`select crm_apply_message_status($1, 'wamid.OUT1', 'read', now(), null)`, [T])
    const late = await one<any>(db, `select crm_apply_message_status($1, 'wamid.OUT1', 'delivered', now(), null) as r`, [T])
    expect(late.r.status).toBe("read")
    expect((await one<any>(db, `select status from messages where id = 'm1'`)).status).toBe("read")
  })

  it("replays statuses that arrived before the wamid was recorded", async () => {
    await outbound(db, "m2", "15552222", "2026-01-01T09:02:00Z")
    const early = await one<any>(db, `select crm_apply_message_status($1, 'wamid.OUT2', 'delivered', now(), null) as r`, [T])
    expect(early.r.found).toBe(false)
    const sent = await one<any>(db, `select crm_mark_message_sent('m2', 'wamid.OUT2') as r`)
    expect(sent.r.status).toBe("delivered")
    const pending = await one<any>(db, `select count(*)::int as n from message_status_pending where wamid = 'wamid.OUT2'`)
    expect(pending.n).toBe(0)
  })

  it("records failures with the error and updates the campaign recipient", async () => {
    const camp = await one<any>(db, `insert into campaigns (tenant_id, name) values ($1, 'C') returning id`, [T])
    const contact = await one<any>(db, `select id from contacts where wa_id = '15552222'`)
    await outbound(db, "m3", "15552222", "2026-01-01T09:03:00Z", camp.id)
    await db.query(`insert into campaign_messages (tenant_id, campaign_id, contact_id, message_id, status) values ($1, $2, $3, 'm3', 'queued')`, [T, camp.id, contact.id])
    await db.query(`select crm_mark_message_sent('m3', 'wamid.OUT3')`)
    await db.query(`select crm_apply_message_status($1, 'wamid.OUT3', 'failed', now(), '{"code":131026}'::jsonb)`, [T])
    const cm = await one<any>(db, `select status, error, sent_at, failed_at from campaign_messages where message_id = 'm3'`)
    expect(cm.status).toBe("failed")
    expect(cm.error.code).toBe(131026)
    expect(cm.failed_at).not.toBeNull()
    const stats = await one<any>(db, `select * from campaign_stats where campaign_id = $1`, [camp.id])
    expect(stats.failed).toBe(1)
    expect(stats.sent).toBe(1)
  })

  it("marks a queued message failed without downgrading a delivered one", async () => {
    await outbound(db, "m4", "15552222", "2026-01-01T09:04:00Z")
    await db.query(`select crm_mark_message_failed('m4', '{"title":"x"}'::jsonb)`)
    expect((await one<any>(db, `select status from messages where id = 'm4'`)).status).toBe("failed")
    await db.query(`select crm_mark_message_failed('m1', '{"title":"x"}'::jsonb)`)
    expect((await one<any>(db, `select status from messages where id = 'm1'`)).status).toBe("read")
  })
})

describe("crm_import_contacts", () => {
  let db: PGlite
  beforeAll(async () => { db = await freshDb() })

  it("inserts new contacts and merges existing ones", async () => {
    await ingest(db, "15553333", "wamid.X", "hi", "2026-01-01T09:00:00Z", "Existing")
    const r = await one<any>(db, `select crm_import_contacts($1, $2::jsonb, array['Import']) as r`, [
      T,
      JSON.stringify([
        { wa_id: "15553333", name: "Other name", company: "Acme", tags: ["VIP"], custom_fields: { city: "Pune" } },
        { wa_id: "15554444", name: "New Person", email: "n@x.com" },
        { wa_id: "15554444", name: "Duplicate row" },
        { wa_id: "", name: "No phone" }
      ])
    ])
    expect(r.r).toEqual({ inserted: 1, updated: 1 })
    const existing = await one<any>(db, `select * from contacts where wa_id = '15553333'`)
    expect(existing.display_name).toBe("Existing")
    expect(existing.company).toBe("Acme")
    expect(existing.in_inbox).toBe(true)
    expect(existing.origin).toBe("inbox")
    expect([...existing.tags].sort()).toEqual(["Import", "VIP"])
    expect(existing.custom_fields.city).toBe("Pune")
    const created = await one<any>(db, `select * from contacts where wa_id = '15554444'`)
    expect(created.origin).toBe("broadcast")
    expect(created.in_inbox).toBe(false)
  })
})

describe("crm_dashboard", () => {
  let db: PGlite
  beforeAll(async () => {
    db = await freshDb()
    const now = Date.now()
    const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString()
    await ingest(db, "1666", "wamid.D1", "hi", iso(120))
    await outbound(db, "o1", "1666", iso(117))
    await ingest(db, "1666", "wamid.D2", "again", iso(60))
    await outbound(db, "o2", "1666", iso(10))
    await ingest(db, "1777", "wamid.D3", "hello?", iso(30 * 60))
    await db.exec(`insert into pipeline_stages (tenant_id, name, ord) values ('${T}', 'New', 1), ('${T}', 'Converted', 2)`)
    await db.exec(`insert into deals (tenant_id, stage_id, value, converted_at, created_at)
      select '${T}', id, 100, now(), now() - interval '4 days' from pipeline_stages where name = 'Converted'`)
    await db.exec(`insert into deals (tenant_id, stage_id, value) select '${T}', id, 50 from pipeline_stages where name = 'New'`)
    await db.exec(`insert into tasks (tenant_id, title, due_at) values ('${T}', 'Call back', now() - interval '1 hour')`)
  })

  it("computes volume, response buckets, pipeline and KPIs", async () => {
    const r = await one<any>(db, `select crm_dashboard($1, now() - interval '7 days', 'UTC') as r`, [T])
    const d = r.r
    expect(d.volume.length).toBe(8)
    const totalIn = d.volume.reduce((s: number, v: any) => s + v.inbound, 0)
    expect(totalIn).toBe(3)
    expect(d.response.turns).toBe(3)
    expect(d.response.answered).toBe(2)
    const bucket = (range: string) => d.response.buckets.find((b: any) => b.range === range).count
    expect(bucket("< 5m")).toBe(1)
    expect(bucket("30m-4h")).toBe(1)
    expect(bucket("> 24h")).toBe(1)
    expect(d.pipeline.win_rate).toBe(50)
    expect(Number(d.pipeline.avg_cycle_days)).toBe(4)
    expect(Number(d.pipeline.open_value)).toBe(50)
    expect(d.kpis.unread_conversations).toBe(2)
    expect(d.kpis.tasks_due_today).toBe(1)
    expect(d.kpis.overdue_tasks).toBe(1)
  })

  it("accepts non-UTC time zones", async () => {
    const r = await one<any>(db, `select crm_dashboard($1, now() - interval '7 days', 'Asia/Kolkata') as r`, [T])
    expect(r.r.volume.length).toBeGreaterThanOrEqual(7)
  })
})

describe("crm_conversations_this_month", () => {
  it("counts distinct chats with a message this calendar month", async () => {
    const db = await freshDb()
    const thisMonth = new Date().toISOString()
    const lastMonth = new Date(Date.now() - 40 * 86400e3).toISOString()
    await ingest(db, "1901", "wamid.C1", "a", thisMonth)
    await ingest(db, "1901", "wamid.C2", "b", thisMonth)
    await ingest(db, "1902", "wamid.C3", "c", thisMonth)
    await ingest(db, "1903", "wamid.C4", "old", lastMonth)
    const r = await one<{ n: number }>(db, `select crm_conversations_this_month($1) as n`, [T])
    expect(r.n).toBe(2)
    const plan = await one<{ plan: string }>(db, `select plan from tenants where id = $1`, [T])
    expect(plan.plan).toBe("starter")
  })
})
