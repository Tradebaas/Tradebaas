import { InMemoryQueue, IQueue } from './Queue';
import { WorkerManager } from './WorkerManager';
import { EntitlementService } from './EntitlementService';
import {
  RunnerJob,
  StartRunnerRequest,
  StartRunnerResponse,
  StopRunnerRequest,
  StopRunnerResponse,
  StatusRequest,
  StatusResponse,
  QueueStats,
} from './types';

export class RunnerOrchestrator {
  private queue: IQueue;
  private workerManager: WorkerManager;
  private entitlementService: EntitlementService;
  private processingInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private isProcessing: boolean = false;

  constructor(queue?: IQueue) {
    this.queue = queue || new InMemoryQueue();
    this.workerManager = new WorkerManager();
    this.entitlementService = new EntitlementService();
  }

  async start(): Promise<void> {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 2000);

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 15000);

    console.log('RunnerOrchestrator started');
  }

  async stop(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    await this.workerManager.cleanup();
    console.log('RunnerOrchestrator stopped');
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const job = await this.queue.dequeue();
      
      if (!job) {
        return;
      }

      const currentWorkerCount = this.workerManager.getWorkerCount(job.userId);
      const entitlementCheck = await this.entitlementService.checkEntitlement(
        job.userId,
        currentWorkerCount
      );

      if (!entitlementCheck.isEntitled) {
        console.warn(`User ${job.userId} not entitled to start worker: ${entitlementCheck.reason}`);
        await this.queue.updateJobStatus(job.jobId, 'failed');
        return;
      }

      try {
        await this.queue.updateJobStatus(job.jobId, 'running');
        const worker = await this.workerManager.spawnWorker(job);
        console.log(`Worker ${worker.workerId} spawned for job ${job.jobId}`);
      } catch (error) {
        console.error(`Failed to spawn worker for job ${job.jobId}:`, error);
        await this.queue.updateJobStatus(job.jobId, 'failed');
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async performHealthCheck(): Promise<void> {
    await this.workerManager.checkWorkerHealth();

    const workers = this.workerManager.getAllWorkers();
    const crashedWorkers = workers.filter(w => w.status === 'crashed');

    for (const worker of crashedWorkers) {
      const job = await this.queue.getJob(worker.jobId);
      if (!job) {
        continue;
      }

      const currentWorkerCount = this.workerManager.getWorkerCount(worker.userId);
      const entitlementCheck = await this.entitlementService.checkEntitlement(
        worker.userId,
        currentWorkerCount - 1
      );

      if (entitlementCheck.isEntitled && worker.restartCount < 3) {
        console.log(`Auto-restarting crashed worker ${worker.workerId} (attempt ${worker.restartCount + 1})`);
        try {
          await this.workerManager.restartCrashedWorker(worker.workerId, job);
          await this.queue.updateJobStatus(job.jobId, 'running');
        } catch (error) {
          console.error(`Failed to restart worker ${worker.workerId}:`, error);
          await this.queue.updateJobStatus(job.jobId, 'crashed');
        }
      } else {
        console.log(`Not restarting worker ${worker.workerId} - max restarts reached or not entitled`);
        await this.queue.updateJobStatus(job.jobId, 'crashed');
      }
    }

    await this.entitlementService.downgradeExpired();
  }

  async startRunner(request: StartRunnerRequest): Promise<StartRunnerResponse> {
    try {
      const currentWorkerCount = this.workerManager.getWorkerCount(request.userId);
      const entitlementCheck = await this.entitlementService.checkEntitlement(
        request.userId,
        currentWorkerCount
      );

      if (!entitlementCheck.isEntitled) {
        return {
          success: false,
          message: 'Not entitled to start runner',
          error: entitlementCheck.reason,
        };
      }

      const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const job: RunnerJob = {
        jobId,
        userId: request.userId,
        strategyId: request.strategyId,
        brokerId: request.brokerId,
        credentials: request.credentials,
        config: request.config,
        createdAt: Date.now(),
        status: 'queued',
      };

      await this.queue.enqueue(job);

      return {
        success: true,
        jobId,
        message: 'Runner job queued successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to start runner',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async stopRunner(request: StopRunnerRequest): Promise<StopRunnerResponse> {
    try {
      const worker = this.workerManager.getWorker(request.workerId);
      
      if (!worker) {
        return {
          success: false,
          message: 'Worker not found',
          error: `Worker ${request.workerId} does not exist`,
        };
      }

      if (worker.userId !== request.userId) {
        return {
          success: false,
          message: 'Unauthorized',
          error: 'You do not own this worker',
        };
      }

      const flattenedPositions = await this.workerManager.stopWorker(
        request.workerId,
        request.flattenPositions || false
      );

      await this.queue.updateJobStatus(worker.jobId, 'stopped');

      return {
        success: true,
        message: 'Worker stopped successfully',
        flattenedPositions,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to stop runner',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(request: StatusRequest): Promise<StatusResponse> {
    try {
      const userWorkers = this.workerManager.getUserWorkers(request.userId);
      const workerStatuses = userWorkers
        .map(w => this.workerManager.getWorkerStatus(w.workerId))
        .filter((status): status is NonNullable<typeof status> => status !== null);

      const queueStats = await this.queue.getStats();
      const userJobs = await this.queue.getUserJobs(request.userId);

      const stats: QueueStats = {
        queuedJobs: userJobs.filter(j => j.status === 'queued').length,
        runningWorkers: workerStatuses.filter(w => w.worker.status === 'running').length,
        totalWorkers: workerStatuses.length,
        failedJobs: userJobs.filter(j => j.status === 'failed' || j.status === 'crashed').length,
      };

      return {
        success: true,
        workers: workerStatuses,
        queueStats: stats,
      };
    } catch (error) {
      return {
        success: false,
        workers: [],
        queueStats: {
          queuedJobs: 0,
          runningWorkers: 0,
          totalWorkers: 0,
          failedJobs: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getEntitlementService(): EntitlementService {
    return this.entitlementService;
  }

  getWorkerManager(): WorkerManager {
    return this.workerManager;
  }

  getQueue(): IQueue {
    return this.queue;
  }
}
