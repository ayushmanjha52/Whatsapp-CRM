/**
 * Applies SQL migrations in order and records them in schema_migrations.
 *
 *   DATABASE_URL=postgresql://... bun run migrate                  # apply pending
 *   DATABASE_URL=postgresql://... bun run migrate --status         # list applied / pending
 *   DATABASE_URL=postgresql://... bun run migrate --baseline 0016  # mark 0001…0016 as already applied
 *
 * Use --baseline once on a database that already has the older migrations
 * (they were applied by hand before this tool existed), then run normally.
 * Supabase: Project Settings → Database → Connection string (URI, session pooler or direct).
 */
import { SQL } from "bun"
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const url = process.env.DATABASE_URL
if (!url) throw new Error("Set DATABASE_URL to your Postgres connection string")

const dir = join(import.meta.dir, "../migrations")
const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort()
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] ?? "" : undefined
}

// No named prepared statements: they break behind Supabase's transaction pooler.
const sql = new SQL({ url, prepare: false, max: 1 })
try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  const applied = new Set((await sql`select name from schema_migrations`).map((r: any) => r.name as string))

  const baseline = arg("baseline")
  if (baseline !== undefined) {
    const upTo = files.filter(f => f <= `${baseline}￿`)
    if (upTo.length === 0) throw new Error(`No migration matches --baseline ${baseline}`)
    for (const f of upTo) await sql`insert into schema_migrations (name) values (${f}) on conflict do nothing`
    console.log(`Marked ${upTo.length} migrations as applied (through ${upTo.at(-1)}).`)
  } else if (process.argv.includes("--status")) {
    for (const f of files) console.log(`${applied.has(f) ? "✓ applied" : "· pending"}  ${f}`)
  } else {
    const pending = files.filter(f => !applied.has(f))
    if (pending.length === 0) console.log("Database is up to date.")
    for (const f of pending) {
      process.stdout.write(`Applying ${f} … `)
      await sql.begin(async tx => {
        await tx.unsafe(readFileSync(join(dir, f), "utf8"))
        await tx`insert into schema_migrations (name) values (${f})`
      })
      console.log("done")
    }
  }
} finally {
  await sql.close()
}
