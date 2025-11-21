import {
  handleStartRunner,
  handleStopRunner,
  handleGetRunnerStatus,
  getOrchestratorInstance,
  StartRunnerRequest,
  StopRunnerRequest,
  StatusRequest,
} from '@/backend/src/orchestrator';

export interface RunnerClientConfig {
  strategyId: string;
  brokerId: string;
  credentials: {
    apiKey: string;
    apiSecret: string;
    testnet?: boolean;
  };
  strategyConfig: {
    name: string;
    description?: string;
    type: 'scalping' | 'trend' | 'momentum' | 'arbitrage';
    parameters: Record<string, any>;
    riskManagement: {
      maxPositionSize: number;
      stopLossPercent: number;
      takeProfitPercent: number;
    };
    instruments: string[];
  };
}

export class RunnerClient {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async startRunner(config: RunnerClientConfig) {
    const request: StartRunnerRequest = {
      userId: this.userId,
      strategyId: config.strategyId,
      brokerId: config.brokerId,
      credentials: config.credentials,
      config: config.strategyConfig,
    };

    const response = await handleStartRunner(request);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to start runner');
    }

    return {
      jobId: response.jobId!,
      workerId: response.workerId,
      message: response.message,
    };
  }

  async stopRunner(workerId: string, flattenPositions: boolean = true) {
    const request: StopRunnerRequest = {
      userId: this.userId,
      workerId,
      flattenPositions,
    };

    const response = await handleStopRunner(request);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to stop runner');
    }

    return {
      message: response.message,
      flattenedPositions: response.flattenedPositions || 0,
    };
  }

  async getStatus() {
    const request: StatusRequest = {
      userId: this.userId,
    };

    const response = await handleGetRunnerStatus(request);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to get status');
    }

    return {
      workers: response.workers.map(w => ({
        workerId: w.worker.workerId,
        strategyId: w.worker.strategyId,
        brokerId: w.worker.brokerId,
        status: w.worker.status,
        startedAt: w.worker.startedAt,
        stoppedAt: w.worker.stoppedAt,
        restartCount: w.worker.restartCount,
        positions: w.positions,
        stats: w.stats,
      })),
      queueStats: response.queueStats,
    };
  }

  async stopAllRunners(flattenPositions: boolean = true) {
    const status = await this.getStatus();
    const results = [];

    for (const worker of status.workers) {
      if (worker.status === 'running' || worker.status === 'starting') {
        try {
          const result = await this.stopRunner(worker.workerId, flattenPositions);
          results.push({ workerId: worker.workerId, success: true, ...result });
        } catch (error) {
          results.push({ 
            workerId: worker.workerId, 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  async getEntitlementInfo() {
    const orchestrator = getOrchestratorInstance();
    const entitlementService = orchestrator.getEntitlementService();
    const entitlement = await entitlementService.getEntitlement(this.userId);
    
    if (!entitlement) {
      return {
        tier: 'free',
        maxWorkers: 1,
        isActive: true,
      };
    }

    return {
      tier: entitlement.tier,
      maxWorkers: entitlement.maxWorkers,
      isActive: entitlement.isActive,
      expiresAt: entitlement.expiresAt,
    };
  }

  async upgradeEntitlement(tier: 'basic' | 'pro' | 'enterprise', durationDays?: number) {
    const orchestrator = getOrchestratorInstance();
    const entitlementService = orchestrator.getEntitlementService();
    await entitlementService.upgradeUser(this.userId, tier, durationDays);
  }
}

export async function createRunnerClient(userId: string): Promise<RunnerClient> {
  return new RunnerClient(userId);
}

export function useRunnerOrchestrator() {
  return getOrchestratorInstance();
}

export async function startOrchestrator() {
  const orchestrator = getOrchestratorInstance();
  await orchestrator.start();
}

export async function stopOrchestrator() {
  const orchestrator = getOrchestratorInstance();
  await orchestrator.stop();
}
