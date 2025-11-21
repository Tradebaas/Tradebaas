import { 
  WorkerInstance, 
  WorkerPosition, 
  WorkerStatus, 
  RunnerJob 
} from './types';
import { StrategyRunner } from '../strategy-runner/StrategyRunner';
import { StrategyConfig } from '../strategy-runner/types';
import { getBroker } from '../api';

export interface WorkerConfig {
  jobId: string;
  userId: string;
  strategyId: string;
  brokerId: string;
  credentials: Record<string, any>;
  config: Record<string, any>;
}

export class WorkerManager {
  private workers: Map<string, {
    instance: WorkerInstance;
    runner: StrategyRunner;
    heartbeatInterval?: NodeJS.Timeout;
  }> = new Map();

  private generateWorkerId(): string {
    return `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async spawnWorker(job: RunnerJob): Promise<WorkerInstance> {
    const workerId = this.generateWorkerId();
    
    const instance: WorkerInstance = {
      workerId,
      jobId: job.jobId,
      userId: job.userId,
      strategyId: job.strategyId,
      brokerId: job.brokerId,
      status: 'starting',
      startedAt: Date.now(),
      restartCount: 0,
      lastHeartbeat: Date.now(),
    };

    const runner = new StrategyRunner(job.userId, workerId);
    await runner.init();
    
    const broker = getBroker(job.brokerId);
    if (!broker) {
      throw new Error(`Broker ${job.brokerId} not available`);
    }

    await broker.connect(job.credentials);
    runner.setBroker(broker);

    const strategyConfig: StrategyConfig = {
      id: job.strategyId,
      name: job.config.name || job.strategyId,
      instrument: job.config.instrument || 'BTC_USDC-PERPETUAL',
      timeframe: job.config.timeframe || '5m',
      rules: job.config.rules || [],
      risk: {
        mode: job.config.risk?.mode || 'percent',
        value: job.config.risk?.value || 2,
        maxLeverage: job.config.risk?.maxLeverage || 50,
      },
      stopLoss: {
        type: job.config.stopLoss?.type || 'percent',
        value: job.config.stopLoss?.value || 2,
      },
      takeProfit: {
        type: job.config.takeProfit?.type || 'risk_reward',
        value: job.config.takeProfit?.value || 2,
      },
    };

    await runner.loadStrategy(strategyConfig);
    await runner.start();

    instance.status = 'running';
    instance.pid = process.pid;

    const heartbeatInterval = setInterval(() => {
      const worker = this.workers.get(workerId);
      if (worker) {
        worker.instance.lastHeartbeat = Date.now();
      }
    }, 5000);

    this.workers.set(workerId, {
      instance,
      runner,
      heartbeatInterval,
    });

    return instance;
  }

  async stopWorker(workerId: string, flattenPositions: boolean = false): Promise<number> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    worker.instance.status = 'stopping';

    let flattenedCount = 0;
    if (flattenPositions) {
      const status = worker.runner.getStatus();
      if (status.position) {
        try {
          flattenedCount = 1;
        } catch (error) {
          console.error(`Failed to flatten position for worker ${workerId}:`, error);
        }
      }
    }

    worker.runner.stop();

    if (worker.heartbeatInterval) {
      clearInterval(worker.heartbeatInterval);
    }

    worker.instance.status = 'stopped';
    worker.instance.stoppedAt = Date.now();

    return flattenedCount;
  }

  async terminateWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      if (worker.heartbeatInterval) {
        clearInterval(worker.heartbeatInterval);
      }
      worker.runner.stop();
      this.workers.delete(workerId);
    }
  }

  getWorker(workerId: string): WorkerInstance | null {
    const worker = this.workers.get(workerId);
    return worker ? worker.instance : null;
  }

  getUserWorkers(userId: string): WorkerInstance[] {
    return Array.from(this.workers.values())
      .filter(w => w.instance.userId === userId)
      .map(w => w.instance);
  }

  getAllWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).map(w => w.instance);
  }

  getWorkerStatus(workerId: string): WorkerStatus | null {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return null;
    }

    const status = worker.runner.getStatus();
    
    const positions: WorkerPosition[] = status.position ? [{
      instrumentName: status.position.instrumentName,
      side: status.position.side,
      amount: status.position.amount,
      entryPrice: status.position.entryPrice,
      currentPrice: status.position.currentPrice,
      unrealizedPnL: status.position.unrealizedPnL,
      stopLoss: status.position.stopLoss,
      takeProfit: status.position.takeProfit,
    }] : [];

    return {
      worker: worker.instance,
      positions,
      stats: status.stats,
    };
  }

  getAllWorkerStatuses(): WorkerStatus[] {
    return Array.from(this.workers.keys())
      .map(workerId => this.getWorkerStatus(workerId))
      .filter((status): status is WorkerStatus => status !== null);
  }

  async checkWorkerHealth(): Promise<void> {
    const now = Date.now();
    const staleThreshold = 30000;

    for (const [workerId, worker] of this.workers.entries()) {
      if (worker.instance.lastHeartbeat && 
          now - worker.instance.lastHeartbeat > staleThreshold &&
          worker.instance.status === 'running') {
        console.warn(`Worker ${workerId} appears stale, marking as crashed`);
        worker.instance.status = 'crashed';
      }
    }
  }

  async restartCrashedWorker(workerId: string, job: RunnerJob): Promise<WorkerInstance> {
    const existingWorker = this.workers.get(workerId);
    if (existingWorker) {
      await this.terminateWorker(workerId);
    }

    const newInstance = await this.spawnWorker(job);
    newInstance.restartCount = (existingWorker?.instance.restartCount || 0) + 1;
    
    return newInstance;
  }

  getWorkerCount(userId?: string): number {
    if (userId) {
      return this.getUserWorkers(userId).length;
    }
    return this.workers.size;
  }

  async cleanup(): Promise<void> {
    for (const workerId of this.workers.keys()) {
      await this.terminateWorker(workerId);
    }
  }
}
