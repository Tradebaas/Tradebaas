# Runner Orchestrator Integration Examples

This document shows how to integrate the Runner Orchestrator with the Tradebaas frontend.

## Backend Integration (Server-Side)

The orchestrator is designed to run server-side. In a production environment, you would expose it via REST API or WebSocket.

### Example REST API Server

```typescript
// backend/src/server.ts
import express from 'express';
import {
  handleStartRunner,
  handleStopRunner,
  handleGetRunnerStatus,
  getOrchestratorInstance,
} from './orchestrator';

const app = express();
app.use(express.json());

// Start the orchestrator
const orchestrator = getOrchestratorInstance();
orchestrator.start();

// POST /api/runner/start
app.post('/api/runner/start', async (req, res) => {
  const { userId, strategyId, brokerId, credentials, config } = req.body;
  
  const response = await handleStartRunner({
    userId,
    strategyId,
    brokerId,
    credentials,
    config,
  });
  
  res.json(response);
});

// POST /api/runner/stop
app.post('/api/runner/stop', async (req, res) => {
  const { userId, workerId, flattenPositions } = req.body;
  
  const response = await handleStopRunner({
    userId,
    workerId,
    flattenPositions,
  });
  
  res.json(response);
});

// GET /api/runner/status/:userId
app.get('/api/runner/status/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const response = await handleGetRunnerStatus({ userId });
  
  res.json(response);
});

// POST /api/runner/entitlement/upgrade
app.post('/api/runner/entitlement/upgrade', async (req, res) => {
  const { userId, tier, durationDays } = req.body;
  
  const entitlementService = orchestrator.getEntitlementService();
  await entitlementService.upgradeUser(userId, tier, durationDays);
  
  res.json({ success: true });
});

app.listen(3001, () => {
  console.log('Orchestrator API running on port 3001');
});

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await orchestrator.stop();
  process.exit(0);
});
```

## Frontend Integration

### Using Fetch API

```typescript
// src/lib/orchestratorClient.ts
export interface StartRunnerParams {
  strategyId: string;
  brokerId: string;
  credentials: {
    apiKey: string;
    apiSecret: string;
  };
  config: {
    name: string;
    type: string;
    parameters: Record<string, any>;
    riskManagement: {
      maxPositionSize: number;
      stopLossPercent: number;
      takeProfitPercent: number;
    };
    instruments: string[];
  };
}

export class OrchestratorClient {
  constructor(private baseUrl: string, private userId: string) {}

  async startRunner(params: StartRunnerParams) {
    const response = await fetch(`${this.baseUrl}/api/runner/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        ...params,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to start runner');
    }
    
    return await response.json();
  }

  async stopRunner(workerId: string, flattenPositions = true) {
    const response = await fetch(`${this.baseUrl}/api/runner/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        workerId,
        flattenPositions,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to stop runner');
    }
    
    return await response.json();
  }

  async getStatus() {
    const response = await fetch(
      `${this.baseUrl}/api/runner/status/${this.userId}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get status');
    }
    
    return await response.json();
  }
}
```

### React Hook Integration

```typescript
// src/hooks/use-orchestrator.ts
import { useState, useEffect } from 'react';
import { OrchestratorClient } from '@/lib/orchestratorClient';

export function useOrchestrator(userId: string) {
  const [client] = useState(
    () => new OrchestratorClient('http://localhost:3001', userId)
  );
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = async () => {
    try {
      const data = await client.getStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const startRunner = async (params: any) => {
    const result = await client.startRunner(params);
    await refreshStatus();
    return result;
  };

  const stopRunner = async (workerId: string, flatten = true) => {
    await client.stopRunner(workerId, flatten);
    await refreshStatus();
  };

  return {
    client,
    status,
    loading,
    startRunner,
    stopRunner,
    refreshStatus,
  };
}
```

### Usage in Component

```typescript
// src/components/RunnerManager.tsx
import { useOrchestrator } from '@/hooks/use-orchestrator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function RunnerManager() {
  const userId = 'user-123'; // Get from auth
  const { status, startRunner, stopRunner, loading } = useOrchestrator(userId);

  const handleStart = async () => {
    try {
      await startRunner({
        strategyId: 'scalping-btc',
        brokerId: 'deribit',
        credentials: {
          apiKey: 'your-key',
          apiSecret: 'your-secret',
        },
        config: {
          name: 'BTC Scalping',
          type: 'scalping',
          parameters: {},
          riskManagement: {
            maxPositionSize: 100,
            stopLossPercent: 2,
            takeProfitPercent: 3,
          },
          instruments: ['BTC-PERPETUAL'],
        },
      });
    } catch (error) {
      console.error('Failed to start runner:', error);
    }
  };

  const handleStop = async (workerId: string) => {
    try {
      await stopRunner(workerId, true);
    } catch (error) {
      console.error('Failed to stop runner:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Strategy Runners</h2>
        <Button onClick={handleStart}>Start New Runner</Button>
      </div>

      <div className="grid gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Queue Stats</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Queued</div>
              <div className="text-2xl">{status?.queueStats?.queuedJobs || 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Running</div>
              <div className="text-2xl">{status?.queueStats?.runningWorkers || 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total</div>
              <div className="text-2xl">{status?.queueStats?.totalWorkers || 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Failed</div>
              <div className="text-2xl">{status?.queueStats?.failedJobs || 0}</div>
            </div>
          </div>
        </Card>

        {status?.workers?.map((worker: any) => (
          <Card key={worker.workerId} className="p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold">{worker.strategyId}</h3>
                <p className="text-sm text-muted-foreground">{worker.brokerId}</p>
              </div>
              <div className="flex gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  worker.status === 'running' ? 'bg-success/20 text-success' : 
                  worker.status === 'crashed' ? 'bg-destructive/20 text-destructive' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {worker.status}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStop(worker.workerId)}
                >
                  Stop
                </Button>
              </div>
            </div>

            {worker.positions?.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold mb-2">Positions</h4>
                {worker.positions.map((pos: any, idx: number) => (
                  <div key={idx} className="text-sm grid grid-cols-4 gap-2 p-2 bg-muted/50 rounded">
                    <div>{pos.instrumentName}</div>
                    <div className={pos.side === 'long' ? 'text-success' : 'text-destructive'}>
                      {pos.side.toUpperCase()}
                    </div>
                    <div>{pos.amount}</div>
                    <div className={pos.unrealizedPnL >= 0 ? 'text-success' : 'text-destructive'}>
                      ${pos.unrealizedPnL?.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Trades</div>
                <div className="font-semibold">{worker.stats?.totalTrades || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Win Rate</div>
                <div className="font-semibold">{worker.stats?.winRate?.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-muted-foreground">Total PnL</div>
                <div className={`font-semibold ${worker.stats?.totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ${worker.stats?.totalPnL?.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Restarts</div>
                <div className="font-semibold">{worker.restartCount || 0}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

## Direct Backend Usage (Testing)

For testing or direct backend usage:

```typescript
import {
  handleStartRunner,
  handleStopRunner,
  handleGetRunnerStatus,
  getOrchestratorInstance,
} from './backend/src/orchestrator';

// Start orchestrator
const orchestrator = getOrchestratorInstance();
await orchestrator.start();

// Start a runner
const startResponse = await handleStartRunner({
  userId: 'user-123',
  strategyId: 'scalping-btc',
  brokerId: 'deribit',
  credentials: {
    apiKey: 'key',
    apiSecret: 'secret',
  },
  config: {
    name: 'BTC Scalping',
    type: 'scalping',
    parameters: {},
    riskManagement: {
      maxPositionSize: 100,
      stopLossPercent: 2,
      takeProfitPercent: 3,
    },
    instruments: ['BTC-PERPETUAL'],
  },
});

console.log('Job ID:', startResponse.jobId);

// Get status
const statusResponse = await handleGetRunnerStatus({ userId: 'user-123' });
console.log('Workers:', statusResponse.workers);
console.log('Queue:', statusResponse.queueStats);

// Stop a runner
if (statusResponse.workers.length > 0) {
  const workerId = statusResponse.workers[0].worker.workerId;
  const stopResponse = await handleStopRunner({
    userId: 'user-123',
    workerId,
    flattenPositions: true,
  });
  console.log('Stopped:', stopResponse);
}

// Upgrade entitlement
const entitlementService = orchestrator.getEntitlementService();
await entitlementService.upgradeUser('user-123', 'pro', 30);

// Cleanup
await orchestrator.stop();
```
