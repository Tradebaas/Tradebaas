import { RunnerJob } from './types';

export interface IQueue {
  enqueue(job: RunnerJob): Promise<void>;
  dequeue(): Promise<RunnerJob | null>;
  peek(): Promise<RunnerJob | null>;
  remove(jobId: string): Promise<boolean>;
  getJob(jobId: string): Promise<RunnerJob | null>;
  updateJobStatus(jobId: string, status: RunnerJob['status']): Promise<void>;
  getUserJobs(userId: string): Promise<RunnerJob[]>;
  getAllJobs(): Promise<RunnerJob[]>;
  getStats(): Promise<{
    queued: number;
    running: number;
    stopped: number;
    failed: number;
    crashed: number;
  }>;
  clear(): Promise<void>;
}

export class InMemoryQueue implements IQueue {
  private queue: Map<string, RunnerJob> = new Map();
  private jobOrder: string[] = [];

  async enqueue(job: RunnerJob): Promise<void> {
    this.queue.set(job.jobId, job);
    if (job.status === 'queued') {
      this.jobOrder.push(job.jobId);
    }
  }

  async dequeue(): Promise<RunnerJob | null> {
    while (this.jobOrder.length > 0) {
      const jobId = this.jobOrder.shift()!;
      const job = this.queue.get(jobId);
      
      if (job && job.status === 'queued') {
        return job;
      }
    }
    return null;
  }

  async peek(): Promise<RunnerJob | null> {
    for (const jobId of this.jobOrder) {
      const job = this.queue.get(jobId);
      if (job && job.status === 'queued') {
        return job;
      }
    }
    return null;
  }

  async remove(jobId: string): Promise<boolean> {
    const index = this.jobOrder.indexOf(jobId);
    if (index > -1) {
      this.jobOrder.splice(index, 1);
    }
    return this.queue.delete(jobId);
  }

  async getJob(jobId: string): Promise<RunnerJob | null> {
    return this.queue.get(jobId) || null;
  }

  async updateJobStatus(jobId: string, status: RunnerJob['status']): Promise<void> {
    const job = this.queue.get(jobId);
    if (job) {
      job.status = status;
      this.queue.set(jobId, job);
    }
  }

  async getUserJobs(userId: string): Promise<RunnerJob[]> {
    return Array.from(this.queue.values()).filter(job => job.userId === userId);
  }

  async getAllJobs(): Promise<RunnerJob[]> {
    return Array.from(this.queue.values());
  }

  async getStats(): Promise<{
    queued: number;
    running: number;
    stopped: number;
    failed: number;
    crashed: number;
  }> {
    const jobs = Array.from(this.queue.values());
    return {
      queued: jobs.filter(j => j.status === 'queued').length,
      running: jobs.filter(j => j.status === 'running').length,
      stopped: jobs.filter(j => j.status === 'stopped').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      crashed: jobs.filter(j => j.status === 'crashed').length,
    };
  }

  async clear(): Promise<void> {
    this.queue.clear();
    this.jobOrder = [];
  }
}
