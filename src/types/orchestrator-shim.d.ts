declare module '@/backend/src/orchestrator/client' {
  export type RunnerClient = any;
  export function createRunnerClient(userId: string): Promise<RunnerClient>;
}

declare module '@/backend/src/orchestrator/types' {
  export type WorkerStatus = any;
  export type QueueStats = any;
}
