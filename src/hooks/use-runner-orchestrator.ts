import { useEffect, useState } from 'react';
import { RunnerClient, createRunnerClient } from '@/backend/src/orchestrator/client';
import { WorkerStatus, QueueStats } from '@/backend/src/orchestrator/types';

export interface UseRunnerOrchestratorReturn {
  client: RunnerClient | null;
  workers: WorkerStatus['worker'][];
  positions: Map<string, WorkerStatus['positions']>;
  stats: Map<string, WorkerStatus['stats']>;
  queueStats: QueueStats | null;
  isLoading: boolean;
  error: string | null;
  startRunner: (config: any) => Promise<{ jobId: string; workerId?: string }>;
  stopRunner: (workerId: string, flatten?: boolean) => Promise<void>;
  stopAllRunners: (flatten?: boolean) => Promise<void>;
  refreshStatus: () => Promise<void>;
  entitlement: {
    tier: string;
    maxWorkers: number;
    isActive: boolean;
    expiresAt?: number;
  } | null;
}

export function useRunnerOrchestrator(userId: string): UseRunnerOrchestratorReturn {
  const [client, setClient] = useState<RunnerClient | null>(null);
  const [workers, setWorkers] = useState<WorkerStatus['worker'][]>([]);
  const [positions, setPositions] = useState<Map<string, WorkerStatus['positions']>>(new Map());
  const [stats, setStats] = useState<Map<string, WorkerStatus['stats']>>(new Map());
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [entitlement, setEntitlement] = useState<UseRunnerOrchestratorReturn['entitlement']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initClient = async () => {
      try {
        const newClient = await createRunnerClient(userId);
        setClient(newClient);
        
        const entInfo = await newClient.getEntitlementInfo();
        setEntitlement(entInfo);
        
        await refreshStatusInternal(newClient);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize client');
      } finally {
        setIsLoading(false);
      }
    };

    initClient();
  }, [userId]);

  useEffect(() => {
    if (!client) return;

    const interval = setInterval(() => {
      refreshStatusInternal(client);
    }, 5000);

    return () => clearInterval(interval);
  }, [client]);

  const refreshStatusInternal = async (runnerClient: RunnerClient) => {
    try {
      const status = await runnerClient.getStatus();
      
      setWorkers(status.workers.map(w => w.worker));
      
      const newPositions = new Map<string, WorkerStatus['positions']>();
      const newStats = new Map<string, WorkerStatus['stats']>();
      
      status.workers.forEach(w => {
        newPositions.set(w.workerId, w.positions);
        newStats.set(w.workerId, w.stats);
      });
      
      setPositions(newPositions);
      setStats(newStats);
      setQueueStats(status.queueStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh status');
    }
  };

  const startRunner = async (config: any) => {
    if (!client) throw new Error('Client not initialized');
    
    try {
      setError(null);
      const result = await client.startRunner(config);
      await refreshStatusInternal(client);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start runner';
      setError(message);
      throw new Error(message);
    }
  };

  const stopRunner = async (workerId: string, flatten: boolean = true) => {
    if (!client) throw new Error('Client not initialized');
    
    try {
      setError(null);
      await client.stopRunner(workerId, flatten);
      await refreshStatusInternal(client);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop runner';
      setError(message);
      throw new Error(message);
    }
  };

  const stopAllRunners = async (flatten: boolean = true) => {
    if (!client) throw new Error('Client not initialized');
    
    try {
      setError(null);
      await client.stopAllRunners(flatten);
      await refreshStatusInternal(client);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop all runners';
      setError(message);
      throw new Error(message);
    }
  };

  const refreshStatus = async () => {
    if (!client) throw new Error('Client not initialized');
    await refreshStatusInternal(client);
  };

  return {
    client,
    workers,
    positions,
    stats,
    queueStats,
    isLoading,
    error,
    startRunner,
    stopRunner,
    stopAllRunners,
    refreshStatus,
    entitlement,
  };
}

export function useWorkerStats(workerId: string, userId: string) {
  const { stats, positions, refreshStatus } = useRunnerOrchestrator(userId);

  return {
    stats: stats.get(workerId),
    positions: positions.get(workerId) || [],
    refresh: refreshStatus,
  };
}
