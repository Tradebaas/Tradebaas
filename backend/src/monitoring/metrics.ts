/**
 * Metrics & Monitoring
 * 
 * Prometheus-compatible metrics for observability.
 * 
 * Features (SRE-002):
 * - Prometheus /metrics endpoint
 * - System metrics (uptime, memory, CPU)
 * - Business metrics (trades, strategies, positions)
 * - Recovery metrics (crashes, recovery time)
 * - Health check with detailed status
 */

import * as os from 'os';
import { StrategyManager, StrategyLifecycleState } from '../lifecycle/StrategyManager';

export interface MetricsData {
  // System metrics
  uptime_seconds: number;
  memory_usage_bytes: number;
  memory_total_bytes: number;
  memory_usage_percent: number;
  cpu_usage_percent: number;
  
  // Business metrics
  strategies_active: number;
  positions_open: number;
  trades_total: number;
  trades_success: number;
  trades_failed: number;
  
  // Recovery metrics
  crashes_total: number;
  last_recovery_time_seconds: number;
  last_recovery_success: boolean;
  
  // Health status
  healthy: boolean;
  broker_connected: boolean;
  state_persisted: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  version: string;
  checks: {
    strategyManager: boolean;
    broker: boolean;
    persistence: boolean;
    memory: boolean;
  };
  details: {
    strategy: string | null;
    state: string;
    memoryUsageMB: number;
    memoryLimitMB: number;
  };
}

export class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  private startTime: number = Date.now();
  
  // Metrics counters
  private tradesTotal = 0;
  private tradesSuccess = 0;
  private tradesFailed = 0;
  private crashesTotal = 0;
  private lastRecoveryTimeSeconds = 0;
  private lastRecoverySuccess = false;
  private brokerConnected = false;

  private constructor() {
    console.log('[MetricsCollector] Initialized');
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Increment trade counter
   */
  public recordTrade(success: boolean): void {
    this.tradesTotal++;
    if (success) {
      this.tradesSuccess++;
    } else {
      this.tradesFailed++;
    }
  }

  /**
   * Record crash event
   */
  public recordCrash(): void {
    this.crashesTotal++;
  }

  /**
   * Record recovery event
   */
  public recordRecovery(timeSeconds: number, success: boolean): void {
    this.lastRecoveryTimeSeconds = timeSeconds;
    this.lastRecoverySuccess = success;
  }

  /**
   * Set broker connection status
   */
  public setBrokerConnected(connected: boolean): void {
    this.brokerConnected = connected;
  }

  /**
   * Get all metrics
   */
  public getMetrics(): MetricsData {
    const strategyManager = StrategyManager.getInstance();
    const state = strategyManager.getState();
    
    // Memory metrics
    const memUsage = process.memoryUsage();
    const memoryUsageBytes = memUsage.heapUsed;
    const memoryTotalBytes = os.totalmem();
    const memoryUsagePercent = (memoryUsageBytes / memoryTotalBytes) * 100;

    // CPU metrics (simplified - just load average)
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuUsagePercent = (loadAvg / cpuCount) * 100;

    // Business metrics
    const strategiesActive = strategyManager.isStrategyActive() ? 1 : 0;
    const positionsOpen = state.state === StrategyLifecycleState.POSITION_OPEN ? 1 : 0;

    // Health status
    const healthy = 
      strategyManager.getCurrentState() !== undefined &&
      memoryUsagePercent < 90 &&
      cpuUsagePercent < 95;

    return {
      // System
      uptime_seconds: (Date.now() - this.startTime) / 1000,
      memory_usage_bytes: memoryUsageBytes,
      memory_total_bytes: memoryTotalBytes,
      memory_usage_percent: memoryUsagePercent,
      cpu_usage_percent: cpuUsagePercent,
      
      // Business
      strategies_active: strategiesActive,
      positions_open: positionsOpen,
      trades_total: this.tradesTotal,
      trades_success: this.tradesSuccess,
      trades_failed: this.tradesFailed,
      
      // Recovery
      crashes_total: this.crashesTotal,
      last_recovery_time_seconds: this.lastRecoveryTimeSeconds,
      last_recovery_success: this.lastRecoverySuccess,
      
      // Health
      healthy,
      broker_connected: this.brokerConnected,
      state_persisted: true, // Always true if StrategyManager initialized
    };
  }

  /**
   * Get health status
   */
  public getHealthStatus(): HealthStatus {
    const strategyManager = StrategyManager.getInstance();
    const state = strategyManager.getState();
    const metrics = this.getMetrics();

    // Perform health checks
    const checks = {
      strategyManager: state.state !== undefined,
      broker: this.brokerConnected,
      persistence: true, // Assume true if we got here
      memory: metrics.memory_usage_percent < 90,
    };

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    const failedChecks = Object.values(checks).filter(v => !v).length;
    
    if (failedChecks === 0) {
      status = 'healthy';
    } else if (failedChecks <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      timestamp: Date.now(),
      uptime: metrics.uptime_seconds,
      version: process.env.npm_package_version || '1.0.0',
      checks,
      details: {
        strategy: state.strategyName,
        state: state.state,
        memoryUsageMB: Math.round(metrics.memory_usage_bytes / 1024 / 1024),
        memoryLimitMB: 512, // From systemd config
      },
    };
  }

  /**
   * Format metrics for Prometheus
   */
  public toPrometheusFormat(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Helper to add metric
    const addMetric = (name: string, value: number, help: string, type = 'gauge') => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(`${name} ${value}`);
      lines.push('');
    };

    // System metrics
    addMetric('tradebaas_uptime_seconds', metrics.uptime_seconds, 'Uptime in seconds', 'counter');
    addMetric('tradebaas_memory_usage_bytes', metrics.memory_usage_bytes, 'Memory usage in bytes');
    addMetric('tradebaas_memory_usage_percent', metrics.memory_usage_percent, 'Memory usage percentage');
    addMetric('tradebaas_cpu_usage_percent', metrics.cpu_usage_percent, 'CPU usage percentage');

    // Business metrics
    addMetric('tradebaas_strategies_active', metrics.strategies_active, 'Number of active strategies');
    addMetric('tradebaas_positions_open', metrics.positions_open, 'Number of open positions');
    addMetric('tradebaas_trades_total', metrics.trades_total, 'Total number of trades', 'counter');
    addMetric('tradebaas_trades_success', metrics.trades_success, 'Number of successful trades', 'counter');
    addMetric('tradebaas_trades_failed', metrics.trades_failed, 'Number of failed trades', 'counter');

    // Recovery metrics
    addMetric('tradebaas_crashes_total', metrics.crashes_total, 'Total number of crashes', 'counter');
    addMetric('tradebaas_last_recovery_time_seconds', metrics.last_recovery_time_seconds, 'Last recovery time in seconds');
    addMetric('tradebaas_last_recovery_success', metrics.last_recovery_success ? 1 : 0, 'Last recovery success (1=success, 0=failure)');

    // Health metrics
    addMetric('tradebaas_healthy', metrics.healthy ? 1 : 0, 'Overall health status (1=healthy, 0=unhealthy)');
    addMetric('tradebaas_broker_connected', metrics.broker_connected ? 1 : 0, 'Broker connection status (1=connected, 0=disconnected)');

    return lines.join('\n');
  }

  /**
   * Reset counters (for testing)
   */
  public reset(): void {
    this.tradesTotal = 0;
    this.tradesSuccess = 0;
    this.tradesFailed = 0;
    this.crashesTotal = 0;
    this.lastRecoveryTimeSeconds = 0;
    this.lastRecoverySuccess = false;
    this.startTime = Date.now();
    console.log('[MetricsCollector] Counters reset');
  }
}
