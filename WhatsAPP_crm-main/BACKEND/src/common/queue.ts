import { Queue, Worker, type JobsOptions, type Processor, QueueEvents, type WorkerOptions } from "bullmq"
import Redis from "ioredis"
import { env } from "./config"

let shared: Redis | null = null
const queues = new Map<string, Queue>()

/** Shared connection for commands and publishing. Never use it for SUBSCRIBE or blocking calls. */
export function redis(): Redis {
  if (!shared) shared = createRedisConnection()
  return shared
}

/** A dedicated connection, for subscribers and BullMQ workers. */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
}

export const defaultJobOpts: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 24 * 3600, count: 10000 },
  removeOnFail: { age: 7 * 24 * 3600 }
}

export function queue(name: string): Queue {
  let q = queues.get(name)
  if (!q) {
    q = new Queue(name, { connection: redis(), defaultJobOptions: defaultJobOpts })
    queues.set(name, q)
  }
  return q
}

export function queueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: createRedisConnection() })
}

export function worker<T = any>(
  name: string,
  handler: Processor<T>,
  options?: Pick<WorkerOptions, "concurrency" | "limiter">
): Worker<T> {
  const w = new Worker<T>(name, handler, {
    connection: createRedisConnection(),
    concurrency: options?.concurrency ?? 1,
    limiter: options?.limiter
  })
  w.on("failed", (job, err) => {
    console.error(JSON.stringify({ event: "job_failed", queue: name, job_id: job?.id, attempts: job?.attemptsMade, message: err?.message }))
  })
  w.on("error", err => {
    console.error(JSON.stringify({ event: "worker_error", queue: name, message: err?.message }))
  })
  return w
}
