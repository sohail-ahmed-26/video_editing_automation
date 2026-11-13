import { EventEmitter } from 'node:events';

export interface Job<T = any> {
  id: string;
  name: string;
  data: T;
  progress: number;
  updateProgress: (progress: number) => Promise<void>;
}

export type JobHandler<T = any> = (job: Job<T>) => Promise<any>;

interface QueueOptions {
  connection?: any;
  defaultJobOptions?: any;
}

interface WorkerOptions {
  connection?: any;
  concurrency?: number;
}

class InProcessDispatcher {
  private static instance: InProcessDispatcher;
  public queues = new Map<string, Queue<any>>();
  public workers = new Map<string, Worker<any>>();

  static getInstance(): InProcessDispatcher {
    if (!InProcessDispatcher.instance) {
      InProcessDispatcher.instance = new InProcessDispatcher();
    }
    return InProcessDispatcher.instance;
  }

  registerQueue(queue: Queue<any>) {
    this.queues.set(queue.name, queue);
    const worker = this.workers.get(queue.name);
    if (worker) {
      queue.attachWorker(worker);
    }
  }

  registerWorker(worker: Worker<any>) {
    this.workers.set(worker.name, worker);
    const queue = this.queues.get(worker.name);
    if (queue) {
      queue.attachWorker(worker);
    }
  }
}

export class Queue<T = any> {
  public name: string;
  private pendingJobs: Job<T>[] = [];
  private worker: Worker<T> | null = null;

  constructor(name: string, _options?: QueueOptions) {
    this.name = name;
    InProcessDispatcher.getInstance().registerQueue(this);
  }

  attachWorker(worker: Worker<T>) {
    this.worker = worker;
    this.processPending();
  }

  async add(name: string, data: T, _opts?: any): Promise<Job<T>> {
    const id = `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: Job<T> = {
      id,
      name,
      data,
      progress: 0,
      updateProgress: async (progress: number) => {
        job.progress = progress;
      },
    };

    this.pendingJobs.push(job);
    setImmediate(() => this.processPending());
    return job;
  }

  processPending() {
    if (!this.worker) return;
    while (this.pendingJobs.length > 0 && this.worker.canAcceptJob()) {
      const nextJob = this.pendingJobs.shift();
      if (nextJob) {
        this.worker.run(nextJob);
      }
    }
  }
}

export class Worker<T = any> extends EventEmitter {
  public name: string;
  private handler: JobHandler<T>;
  private concurrency: number;
  private runningCount: number = 0;

  constructor(name: string, handler: JobHandler<T>, options?: WorkerOptions) {
    super();
    this.name = name;
    this.handler = handler;
    this.concurrency = options?.concurrency || 1;
    InProcessDispatcher.getInstance().registerWorker(this);
  }

  canAcceptJob(): boolean {
    return this.runningCount < this.concurrency;
  }

  async run(job: Job<T>) {
    this.runningCount++;
    try {
      await this.handler(job);
      this.emit('completed', job);
    } catch (err) {
      this.emit('failed', job, err);
    } finally {
      this.runningCount--;
      const queue = InProcessDispatcher.getInstance().queues.get(this.name);
      if (queue) {
        queue.processPending();
      }
    }
  }

  async close(): Promise<void> {
    // Cleanup if needed
  }
}
