import { Queue, Worker, type JobsOptions, QueueEvents, type WorkerOptions } from "bullmq"
import Redis, { type RedisOptions } from "ioredis"
import { getEnv } from "./config"

const env = getEnv()

export function redis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
}

function redisOptions(): RedisOptions {
  try {
    const u = new URL(env.REDIS_URL)
    const opts: RedisOptions = {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password || undefined,
      tls: u.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null
    }
    return opts
  } catch {
    return { maxRetriesPerRequest: null }
  }
}

export function queue(name: string): Queue {
  return new Queue(name, { connection: redis(), defaultJobOptions: defaultJobOpts })
}

export function queueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: redis() })
}

export function worker(name: string, handler: ConstructorParameters<typeof Worker>[1], options?: Pick<WorkerOptions, "concurrency">): Worker {
  return new Worker(name, handler, { connection: redis(), concurrency: options?.concurrency ?? 1 })
}

export const defaultJobOpts: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 }
}
