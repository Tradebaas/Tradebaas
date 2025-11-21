import { StrategyRunner } from './StrategyRunner';
import { StrategyConfig, StrategyStatus } from './types';
import { getBroker } from '../api';

let strategyRunner: StrategyRunner | null = null;

function getRunner(): StrategyRunner {
  if (!strategyRunner) {
    // Initialize with default userId and workerId
    // TODO: Pass these from runtime context (e.g., request headers, environment)
    strategyRunner = new StrategyRunner('default-user', 'strategy-runner-1');
  }
  return strategyRunner;
}

export interface LoadStrategyRequest {
  config: StrategyConfig;
  brokerId: string;
}

export interface LoadStrategyResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface StartStrategyResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface StopStrategyResponse {
  success: boolean;
  message: string;
}

export interface StatusResponse {
  success: boolean;
  status: StrategyStatus;
}

export async function handleLoadStrategy(request: LoadStrategyRequest): Promise<LoadStrategyResponse> {
  try {
    const runner = getRunner();
    
    if (runner.isActive()) {
      return {
        success: false,
        message: 'Cannot load strategy while runner is active',
        error: 'Runner must be stopped first',
      };
    }
    
    const broker = getBroker(request.brokerId);
    
    if (!broker) {
      return {
        success: false,
        message: 'Broker not found',
        error: `Broker ${request.brokerId} not available`,
      };
    }
    
    runner.setBroker(broker);
    await runner.loadStrategy(request.config);
    
    return {
      success: true,
      message: `Strategy ${request.config.name} loaded successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to load strategy',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleStartStrategy(): Promise<StartStrategyResponse> {
  try {
    const runner = getRunner();
    
    await runner.start();
    
    return {
      success: true,
      message: 'Strategy runner started',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to start strategy',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleStopStrategy(): Promise<StopStrategyResponse> {
  try {
    const runner = getRunner();
    
    runner.stop();
    
    return {
      success: true,
      message: 'Strategy runner stopped',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to stop strategy',
    };
  }
}

export async function handleGetStatus(): Promise<StatusResponse> {
  try {
    const runner = getRunner();
    
    const status = runner.getStatus();
    
    return {
      success: true,
      status,
    };
  } catch (error) {
    return {
      success: true,
      status: {
        isRunning: false,
        strategyId: null,
        position: null,
        lastSignal: null,
        lastExecutionTime: 0,
        stats: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalPnL: 0,
          winRate: 0,
        },
      },
    };
  }
}
