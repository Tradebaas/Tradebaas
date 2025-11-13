import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryQueue } from '../src/orchestrator/Queue';
import { RunnerJob } from '../src/orchestrator/types';

describe('InMemoryQueue', () => {
  let queue: InMemoryQueue;

  beforeEach(() => {
    queue = new InMemoryQueue();
  });

  describe('enqueue and dequeue', () => {
    it('should enqueue and dequeue a job', async () => {
      const job: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      await queue.enqueue(job);
      const dequeuedJob = await queue.dequeue();

      expect(dequeuedJob).toEqual(job);
    });

    it('should return null when dequeuing from empty queue', async () => {
      const job = await queue.dequeue();
      expect(job).toBeNull();
    });

    it('should maintain FIFO order', async () => {
      const job1: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      const job2: RunnerJob = {
        jobId: 'job-2',
        userId: 'user-2',
        strategyId: 'strategy-2',
        brokerId: 'binance',
        credentials: {},
        config: {},
        createdAt: Date.now() + 1000,
        status: 'queued',
      };

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      const first = await queue.dequeue();
      const second = await queue.dequeue();

      expect(first?.jobId).toBe('job-1');
      expect(second?.jobId).toBe('job-2');
    });
  });

  describe('peek', () => {
    it('should peek at next job without removing it', async () => {
      const job: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      await queue.enqueue(job);
      const peeked = await queue.peek();
      const dequeuedJob = await queue.dequeue();

      expect(peeked).toEqual(job);
      expect(dequeuedJob).toEqual(job);
    });

    it('should return null when peeking empty queue', async () => {
      const job = await queue.peek();
      expect(job).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove a job by id', async () => {
      const job: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      await queue.enqueue(job);
      const removed = await queue.remove('job-1');
      const dequeuedJob = await queue.dequeue();

      expect(removed).toBe(true);
      expect(dequeuedJob).toBeNull();
    });

    it('should return false when removing non-existent job', async () => {
      const removed = await queue.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getJob', () => {
    it('should retrieve a job by id', async () => {
      const job: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      await queue.enqueue(job);
      const retrieved = await queue.getJob('job-1');

      expect(retrieved).toEqual(job);
    });

    it('should return null for non-existent job', async () => {
      const job = await queue.getJob('non-existent');
      expect(job).toBeNull();
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status', async () => {
      const job: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      await queue.enqueue(job);
      await queue.updateJobStatus('job-1', 'running');
      const updated = await queue.getJob('job-1');

      expect(updated?.status).toBe('running');
    });

    it('should handle updating non-existent job gracefully', async () => {
      await expect(queue.updateJobStatus('non-existent', 'running')).resolves.not.toThrow();
    });
  });

  describe('getUserJobs', () => {
    it('should return all jobs for a user', async () => {
      const job1: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      const job2: RunnerJob = {
        jobId: 'job-2',
        userId: 'user-1',
        strategyId: 'strategy-2',
        brokerId: 'binance',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'running',
      };

      const job3: RunnerJob = {
        jobId: 'job-3',
        userId: 'user-2',
        strategyId: 'strategy-3',
        brokerId: 'bybit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.enqueue(job3);

      const userJobs = await queue.getUserJobs('user-1');

      expect(userJobs).toHaveLength(2);
      expect(userJobs.every(j => j.userId === 'user-1')).toBe(true);
    });

    it('should return empty array for user with no jobs', async () => {
      const jobs = await queue.getUserJobs('user-with-no-jobs');
      expect(jobs).toEqual([]);
    });
  });

  describe('getAllJobs', () => {
    it('should return all jobs in queue', async () => {
      const job1: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      const job2: RunnerJob = {
        jobId: 'job-2',
        userId: 'user-2',
        strategyId: 'strategy-2',
        brokerId: 'binance',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'running',
      };

      await queue.enqueue(job1);
      await queue.enqueue(job2);

      const allJobs = await queue.getAllJobs();

      expect(allJobs).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const jobs: RunnerJob[] = [
        {
          jobId: 'job-1',
          userId: 'user-1',
          strategyId: 'strategy-1',
          brokerId: 'deribit',
          credentials: {},
          config: {},
          createdAt: Date.now(),
          status: 'queued',
        },
        {
          jobId: 'job-2',
          userId: 'user-2',
          strategyId: 'strategy-2',
          brokerId: 'binance',
          credentials: {},
          config: {},
          createdAt: Date.now(),
          status: 'running',
        },
        {
          jobId: 'job-3',
          userId: 'user-3',
          strategyId: 'strategy-3',
          brokerId: 'bybit',
          credentials: {},
          config: {},
          createdAt: Date.now(),
          status: 'stopped',
        },
        {
          jobId: 'job-4',
          userId: 'user-4',
          strategyId: 'strategy-4',
          brokerId: 'okx',
          credentials: {},
          config: {},
          createdAt: Date.now(),
          status: 'failed',
        },
      ];

      for (const job of jobs) {
        await queue.enqueue(job);
      }

      const stats = await queue.getStats();

      expect(stats.queued).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.stopped).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.crashed).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all jobs', async () => {
      const job1: RunnerJob = {
        jobId: 'job-1',
        userId: 'user-1',
        strategyId: 'strategy-1',
        brokerId: 'deribit',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'queued',
      };

      const job2: RunnerJob = {
        jobId: 'job-2',
        userId: 'user-2',
        strategyId: 'strategy-2',
        brokerId: 'binance',
        credentials: {},
        config: {},
        createdAt: Date.now(),
        status: 'running',
      };

      await queue.enqueue(job1);
      await queue.enqueue(job2);
      await queue.clear();

      const allJobs = await queue.getAllJobs();
      const stats = await queue.getStats();

      expect(allJobs).toEqual([]);
      expect(stats.queued).toBe(0);
      expect(stats.running).toBe(0);
    });
  });
});
