# Runner Orchestrator & Scaling

The Runner Orchestrator is a queue-based worker management system that enables per-user strategy execution with entitlement checks, auto-restart capabilities, and position management.

## Architecture

### Components

1. **RunnerOrchestrator**: Main coordinator that manages the queue, workers, and entitlements
2. **Queue (IQueue)**: Job queue interface with in-memory implementation (extensible to Redis/RabbitMQ)
3. **WorkerManager**: Spawns, monitors, and terminates strategy runner workers
4. **EntitlementService**: Validates user subscriptions and worker limits
5. **API Layer**: HTTP-like interface for starting, stopping, and monitoring runners

## Features

### Job Queueing
- Jobs are queued with user ID, strategy ID, broker, and credentials
- Queue automatically processes jobs based on entitlement checks
- Jobs track status: `queued`, `running`, `stopped`, `failed`, `crashed`

### Worker Management
- Each worker runs independently with isolated state
- Workers are spawned with user-specific configuration
- Environment variables and credentials injected per worker
- Process ID (PID) tracking for monitoring

### Entitlement System
- Tier-based limits:
  - **Free**: 1 worker
  - **Basic**: 3 workers
  - **Pro**: 10 workers
  - **Enterprise**: 50 workers
- Expiration tracking and automatic downgrade
- Per-user worker count enforcement

### Health Monitoring
- Heartbeat checks every 5 seconds
- Workers marked as crashed after 30 seconds of inactivity
- Automatic restart for crashed workers (max 3 attempts)
- Only entitled users can have workers auto-restarted

### Position Management
- Real-time position tracking per worker
- Market-flatten on worker stop (optional)
- Position statistics: PnL, win rate, trade counts

## API Usage

### Start Runner

```typescript
import { handleStartRunner } from './orchestrator';

const response = await handleStartRunner({
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
    parameters: {
      timeframe: '1m',
      rsiPeriod: 14,
    },
    riskManagement: {
      maxPositionSize: 100,
      stopLossPercent: 2,
      takeProfitPercent: 3,
    },
    instruments: ['BTC-PERPETUAL'],
  },
});

// Response: { success: true, jobId: 'job-xxx', message: '...' }
```

### Stop Runner

```typescript
import { handleStopRunner } from './orchestrator';

const response = await handleStopRunner({
  userId: 'user-123',
  workerId: 'worker-xxx',
  flattenPositions: true, // Close all open positions
});

// Response: { success: true, message: '...', flattenedPositions: 1 }
```

### Get Status

```typescript
import { handleGetRunnerStatus } from './orchestrator';

const response = await handleGetRunnerStatus({
  userId: 'user-123',
});

// Response: {
//   success: true,
//   workers: [
//     {
//       worker: {
//         workerId: 'worker-xxx',
//         status: 'running',
//         startedAt: 1234567890,
//         ...
//       },
//       positions: [
//         {
//           instrumentName: 'BTC-PERPETUAL',
//           side: 'long',
//           amount: 100,
//           entryPrice: 50000,
//           unrealizedPnL: 150,
//         }
//       ],
//       stats: {
//         totalTrades: 10,
//         winningTrades: 7,
//         losingTrades: 3,
//         totalPnL: 450,
//         winRate: 70,
//       }
//     }
//   ],
//   queueStats: {
//     queuedJobs: 0,
//     runningWorkers: 1,
//     totalWorkers: 1,
//     failedJobs: 0,
//   }
// }
```

### Manage Entitlements

```typescript
import { getOrchestratorInstance } from './orchestrator';

const orchestrator = getOrchestratorInstance();
const entitlementService = orchestrator.getEntitlementService();

// Upgrade user to Pro tier for 30 days
await entitlementService.upgradeUser('user-123', 'pro', 30);

// Check entitlement
const check = await entitlementService.checkEntitlement('user-123', currentWorkerCount);
// Returns: { isEntitled: true, tier: 'pro', maxWorkers: 10, currentWorkers: 1 }
```

## Scaling Considerations

### Current Implementation
- **In-Memory Queue**: Fast but not persistent across restarts
- **Single Process**: All workers run in the same Node.js process
- **Local State**: Worker and job state stored in memory

### Production Scaling Path

#### 1. Distributed Queue
Replace `InMemoryQueue` with Redis or RabbitMQ:

```typescript
import { IQueue } from './orchestrator';
import Redis from 'ioredis';

class RedisQueue implements IQueue {
  private redis: Redis;
  
  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }
  
  async enqueue(job: RunnerJob): Promise<void> {
    await this.redis.lpush('job-queue', JSON.stringify(job));
    await this.redis.set(`job:${job.jobId}`, JSON.stringify(job));
  }
  
  async dequeue(): Promise<RunnerJob | null> {
    const data = await this.redis.rpop('job-queue');
    return data ? JSON.parse(data) : null;
  }
  
  // ... implement other methods
}

// Use Redis queue
const orchestrator = new RunnerOrchestrator(new RedisQueue('redis://localhost:6379'));
```

#### 2. Docker Workers
Each worker runs in its own Docker container:

```typescript
import Docker from 'dockerode';

class DockerWorkerManager extends WorkerManager {
  private docker: Docker;
  
  async spawnWorker(job: RunnerJob): Promise<WorkerInstance> {
    const container = await this.docker.createContainer({
      Image: 'tradebaas-worker:latest',
      Env: [
        `USER_ID=${job.userId}`,
        `STRATEGY_ID=${job.strategyId}`,
        `BROKER_ID=${job.brokerId}`,
        `API_KEY=${job.credentials.apiKey}`,
        `API_SECRET=${job.credentials.apiSecret}`,
        `CONFIG=${JSON.stringify(job.config)}`,
      ],
    });
    
    await container.start();
    
    // Track container and return worker instance
  }
}
```

#### 3. Kubernetes Orchestration
Deploy workers as Kubernetes Jobs:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: worker-${workerId}
spec:
  template:
    spec:
      containers:
      - name: strategy-runner
        image: tradebaas-worker:latest
        env:
        - name: USER_ID
          value: "${userId}"
        - name: STRATEGY_ID
          value: "${strategyId}"
        - name: BROKER_ID
          value: "${brokerId}"
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: user-${userId}-credentials
              key: apiKey
      restartPolicy: OnFailure
```

```typescript
import k8s from '@kubernetes/client-node';

class K8sWorkerManager extends WorkerManager {
  private k8sApi: k8s.BatchV1Api;
  
  async spawnWorker(job: RunnerJob): Promise<WorkerInstance> {
    const jobManifest = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: `worker-${workerId}` },
      spec: {
        template: {
          spec: {
            containers: [{
              name: 'strategy-runner',
              image: 'tradebaas-worker:latest',
              env: [
                { name: 'USER_ID', value: job.userId },
                { name: 'STRATEGY_ID', value: job.strategyId },
                // ...
              ],
            }],
            restartPolicy: 'OnFailure',
          },
        },
      },
    };
    
    await this.k8sApi.createNamespacedJob('default', jobManifest);
    
    // Track K8s job and return worker instance
  }
}
```

## Load Control

The orchestrator implements several load control mechanisms:

### Queue Throttling
- Jobs processed one at a time (configurable)
- Prevents worker spawn storms
- Graceful queue draining

### Entitlement Enforcement
- Hard limits on concurrent workers per user
- Automatic rejection of over-limit requests
- Tier-based resource allocation

### Health-Based Backpressure
- Crashed workers count against user limits
- Failed auto-restarts prevent infinite loops
- Circuit breaker pattern for failing strategies

### Resource Monitoring
```typescript
// Monitor system resources
const stats = await orchestrator.getStatus({ userId: 'system' });
console.log(`Running workers: ${stats.queueStats.runningWorkers}`);
console.log(`Queued jobs: ${stats.queueStats.queuedJobs}`);

// Implement backpressure if needed
if (stats.queueStats.runningWorkers > MAX_SYSTEM_WORKERS) {
  // Pause queue processing
  // Alert operators
  // Scale infrastructure
}
```

## Testing

```typescript
import { RunnerOrchestrator } from './orchestrator';

describe('RunnerOrchestrator', () => {
  let orchestrator: RunnerOrchestrator;
  
  beforeEach(async () => {
    orchestrator = new RunnerOrchestrator();
    await orchestrator.start();
  });
  
  afterEach(async () => {
    await orchestrator.stop();
  });
  
  it('should enqueue and process job', async () => {
    const response = await orchestrator.startRunner({
      userId: 'test-user',
      strategyId: 'test-strategy',
      brokerId: 'deribit',
      credentials: { apiKey: 'test', apiSecret: 'test' },
      config: { name: 'Test', type: 'scalping' },
    });
    
    expect(response.success).toBe(true);
    expect(response.jobId).toBeDefined();
  });
  
  it('should enforce entitlement limits', async () => {
    // Start first worker (should succeed)
    const resp1 = await orchestrator.startRunner({
      userId: 'free-user',
      strategyId: 'strat-1',
      // ...
    });
    expect(resp1.success).toBe(true);
    
    // Start second worker (should fail for free tier)
    const resp2 = await orchestrator.startRunner({
      userId: 'free-user',
      strategyId: 'strat-2',
      // ...
    });
    expect(resp2.success).toBe(false);
    expect(resp2.error).toContain('limit');
  });
});
```

## Acceptance Criteria

✅ **Per-User Workers**: Each user's strategies run in isolated workers  
✅ **Queue Control**: Redis/RabbitMQ-compatible queue interface manages load  
✅ **Entitlement Checks**: `/runner/start` validates user tier and worker limits  
✅ **Worker Termination**: `/runner/stop` terminates worker and optionally flattens positions  
✅ **Status Monitoring**: `/runner/status` returns active workers and positions  
✅ **Auto-Restart**: Crashed workers automatically restart if user is entitled  
✅ **Independent Execution**: Workers run independently with isolated state  
✅ **Load Management**: Queue prevents system overload and enforces limits
