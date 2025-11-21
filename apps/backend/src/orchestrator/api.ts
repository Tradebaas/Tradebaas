import { RunnerOrchestrator } from './RunnerOrchestrator';
import {
  StartRunnerRequest,
  StartRunnerResponse,
  StopRunnerRequest,
  StopRunnerResponse,
  StatusRequest,
  StatusResponse,
} from './types';

let orchestrator: RunnerOrchestrator | null = null;

function getOrchestrator(): RunnerOrchestrator {
  if (!orchestrator) {
    orchestrator = new RunnerOrchestrator();
    orchestrator.start();
  }
  return orchestrator;
}

export async function handleStartRunner(request: StartRunnerRequest): Promise<StartRunnerResponse> {
  const orch = getOrchestrator();
  return await orch.startRunner(request);
}

export async function handleStopRunner(request: StopRunnerRequest): Promise<StopRunnerResponse> {
  const orch = getOrchestrator();
  return await orch.stopRunner(request);
}

export async function handleGetRunnerStatus(request: StatusRequest): Promise<StatusResponse> {
  const orch = getOrchestrator();
  return await orch.getStatus(request);
}

export function getOrchestratorInstance(): RunnerOrchestrator {
  return getOrchestrator();
}

export async function shutdownOrchestrator(): Promise<void> {
  if (orchestrator) {
    await orchestrator.stop();
    orchestrator = null;
  }
}
