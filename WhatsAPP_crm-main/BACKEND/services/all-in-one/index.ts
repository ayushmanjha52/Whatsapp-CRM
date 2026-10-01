/**
 * Runs the whole backend in one process: migrations, the four queue workers and the
 * gateway (API, frontend, webhooks). Made for single-instance hosting such as Render's
 * free plan; split into separate services when you need to scale.
 */
import { join } from "path"
import { assertEnv } from "../../src/common/config"
import { startInboxWorker } from "../inbox-service/index"
import { startSenderWorker } from "../messaging-worker/index"
import { startMediaWorker } from "../media-uploads/index"
import { startCampaignWorker } from "../campaign-worker/index"
import { startGateway } from "../api-gateway/index"

assertEnv("all-in-one", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "SUPABASE_ANON_KEY", "DATA_ENCRYPTION_KEY"])

// Free plans have no pre-deploy step, so migrations run here. A failure stops startup
// rather than serving the app against a schema it doesn't expect.
if (process.env.DATABASE_URL) {
  const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "../../tools/migrate.ts")], { stdout: "inherit", stderr: "inherit", env: process.env })
  const code = await proc.exited
  if (code !== 0) {
    console.error(JSON.stringify({ event: "migrations_failed", code }))
    process.exit(code || 1)
  }
} else {
  console.warn(JSON.stringify({ event: "migrations_skipped", reason: "DATABASE_URL not set" }))
}

startInboxWorker()
startSenderWorker()
startMediaWorker()
startCampaignWorker()
await startGateway()
