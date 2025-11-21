import { MetricsCollector } from './monitoring/metrics';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    websocket: {
      status: 'connected' | 'disconnected' | 'reconnecting';
      lastHeartbeat?: number;
    };
    strategies: {
      total: number;
      active: number;
    };
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      percentage: number;
    };
  };
  version: string;
}

export interface ReadyStatus {
  ready: boolean;
  checks: {
    websocket: boolean;
    stateManager: boolean;
    credentialsManager: boolean;
  };
  timestamp: string;
}

// Global health state
let websocketStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
let websocketLastHeartbeat: number = 0;
let activeStrategiesCount: number = 0;
let totalStrategiesCount: number = 0;

/**
 * Update WebSocket health status
 */
export function updateWebSocketHealth(status: 'connected' | 'disconnected' | 'reconnecting'): void {
  websocketStatus = status;
  if (status === 'connected') {
    websocketLastHeartbeat = Date.now();
  }
}

/**
 * Update WebSocket heartbeat timestamp
 */
export function updateWebSocketHeartbeat(): void {
  websocketLastHeartbeat = Date.now();
}

/**
 * Update strategies count
 */
export function updateStrategiesHealth(active: number, total: number): void {
  activeStrategiesCount = active;
  totalStrategiesCount = total;
}

/**
 * Check if system is healthy
 */
export async function checkHealth(): Promise<HealthStatus> {
  const metrics = MetricsCollector.getInstance();
  const metricsData = metrics.getMetrics();
  const healthStatus = metrics.getHealthStatus();
  
  // Check if WebSocket is stale (no heartbeat in last 60 seconds)
  const websocketStale = websocketStatus === 'connected' && 
                         websocketLastHeartbeat > 0 && 
                         (Date.now() - websocketLastHeartbeat) > 60000;
  
  const health: HealthStatus = {
    status: healthStatus.status,
    timestamp: new Date(healthStatus.timestamp).toISOString(),
    uptime: healthStatus.uptime,
    services: {
      websocket: {
        status: websocketStale ? 'reconnecting' : websocketStatus,
        lastHeartbeat: websocketLastHeartbeat || undefined,
      },
      strategies: {
        total: totalStrategiesCount,
        active: activeStrategiesCount, // FIX: Use the global variable, not metrics
      },
    },
    system: {
      memory: {
        used: healthStatus.details.memoryUsageMB,
        total: healthStatus.details.memoryLimitMB,
        percentage: Math.round(metricsData.memory_usage_percent),
      },
      cpu: {
        percentage: Math.round(metricsData.cpu_usage_percent * 100) / 100,
      },
    },
    version: healthStatus.version,
  };

  // Override status if WebSocket is down
  if (websocketStatus === 'disconnected' || websocketStale) {
    health.status = 'unhealthy';
  } else if (websocketStatus === 'reconnecting') {
    health.status = 'degraded';
  }

  return health;
}

/**
 * Check if system is ready to receive traffic
 */
export async function checkReady(): Promise<ReadyStatus> {
  const ready: ReadyStatus = {
    ready: false,
    checks: {
      websocket: websocketStatus === 'connected',
      stateManager: true, // Assume true if server started
      credentialsManager: true, // Assume true if server started
    },
    timestamp: new Date().toISOString(),
  };

  ready.ready = Object.values(ready.checks).every(check => check === true);

  return ready;
}

export function createHealthHandler() {
  return async (req: any, res: any) => {
    try {
      const health = await checkHealth();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }));
    }
  };
}

/**
 * Create Prometheus metrics handler
 */
export function createMetricsHandler() {
  return async (req: any, res: any) => {
    try {
      const metrics = MetricsCollector.getInstance();
      const prometheusFormat = metrics.toPrometheusFormat();
      
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(prometheusFormat);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`# Error generating metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
}
