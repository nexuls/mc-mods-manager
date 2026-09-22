import type { JobEvent } from '@mc-mod/shared'

/** How long a finished job's events stay around for a late or reconnecting client. */
const KEEP_FINISHED_MS = 10 * 60_000

/** A background job's event log. Clients replay it from the start, then follow new events. */
export class Job {
  private readonly log: JobEvent[] = []
  private readonly waiters = new Set<() => void>()

  constructor(readonly id: string) {}

  emit(event: JobEvent): void {
    this.log.push(event)
    for (const wake of this.waiters) wake()
    this.waiters.clear()
  }

  get finished(): boolean {
    return this.log.at(-1)?.type === 'done'
  }

  /** Every event so far, then new ones as they come; ends after `done` or when `signal` aborts. */
  async *events(signal?: AbortSignal): AsyncGenerator<JobEvent> {
    let i = 0
    while (!signal?.aborted) {
      while (i < this.log.length) {
        const event = this.log[i++]
        if (!event) continue
        yield event
        if (event.type === 'done') return
      }
      await new Promise<void>((resolve) => {
        this.waiters.add(resolve)
        signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    }
  }
}

/** In-memory jobs of this run. */
export class JobService {
  private readonly jobs = new Map<string, Job>()

  create(): Job {
    const job = new Job(crypto.randomUUID())
    this.jobs.set(job.id, job)
    return job
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  /** Marks a job finished; it's forgotten after a while. */
  finish(job: Job): void {
    setTimeout(() => this.jobs.delete(job.id), KEEP_FINISHED_MS).unref()
  }
}
