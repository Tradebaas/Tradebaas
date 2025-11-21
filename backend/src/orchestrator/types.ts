export interface RunnerJob {
  jobId: string;
  userId: string;
  strategyId: string;
  brokerId: string;
  credentials: Record<string, any>;
  config: Record<string, any>;
  createdAt: number;
  status: 'queued' | 'running' | 'stopped' | 'failed' | 'crashed';
}

export interface WorkerInstance {
  workerId: string;
  jobId: string;
  userId: string;
  strategyId: string;
  brokerId: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
  startedAt: number;
  stoppedAt?: number;
  restartCount: number;
  pid?: number;
  lastHeartbeat?: number;
}

export interface WorkerPosition {
  instrumentName: string;
  side: 'long' | 'short';
  amount: number;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface WorkerStatus {
  worker: WorkerInstance;
  positions: WorkerPosition[];
  stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnL: number;
    winRate: number;
  };
}

export interface QueueStats {
  queuedJobs: number;
  runningWorkers: number;
  totalWorkers: number;
  failedJobs: number;
}

export interface EntitlementCheck {
  isEntitled: boolean;
  tier: string;
  maxWorkers: number;
  currentWorkers: number;
  reason?: string;
}

export interface StartRunnerRequest {
  userId: string;
  strategyId: string;
  brokerId: string;
  credentials: Record<string, any>;
  config: Record<string, any>;
}

export interface StartRunnerResponse {
  success: boolean;
  jobId?: string;
  workerId?: string;
  message: string;
  error?: string;
}

export interface StopRunnerRequest {
  userId: string;
  workerId: string;
  flattenPositions?: boolean;
}

export interface StopRunnerResponse {
  success: boolean;
  message: string;
  flattenedPositions?: number;
  error?: string;
}

export interface StatusRequest {
  userId: string;
}

export interface StatusResponse {
  success: boolean;
  workers: WorkerStatus[];
  queueStats: QueueStats;
  error?: string;
}
