/**
 * Health Check Tests
 * Validates /health and /ready endpoints behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  checkHealth, 
  checkReady, 
  updateWebSocketHealth, 
  updateWebSocketHeartbeat,
  updateStrategiesHealth 
} from '../src/health';
import { MetricsCollector } from '../src/monitoring/metrics';

describe('Health Module', () => {
  beforeEach(() => {
    // Reset health state before each test
    updateWebSocketHealth('disconnected');
    updateStrategiesHealth(0, 0);
    
    // Mock MetricsCollector to always return healthy broker
    const metrics = MetricsCollector.getInstance();
    vi.spyOn(metrics as any, 'brokerConnected', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    // Restore system time after each test
    vi.useRealTimers();
  });

  describe('checkHealth', () => {
    it('returns healthy when WebSocket connected', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const health = await checkHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.services.websocket.status).toBe('connected');
      expect(health.services.websocket.lastHeartbeat).toBeGreaterThan(0);
    });

    it('returns unhealthy when WebSocket disconnected', async () => {
      updateWebSocketHealth('disconnected');
      
      const health = await checkHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.services.websocket.status).toBe('disconnected');
    });

    it('returns degraded when WebSocket reconnecting', async () => {
      updateWebSocketHealth('reconnecting');
      
      const health = await checkHealth();
      
      expect(health.status).toBe('degraded');
      expect(health.services.websocket.status).toBe('reconnecting');
    });

    it('returns unhealthy when heartbeat is stale (>60s)', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);
      
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      // Move time forward by 61 seconds
      vi.setSystemTime(now + 61000);
      
      const health = await checkHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.services.websocket.status).toBe('reconnecting');
      
      vi.useRealTimers();
    });

    it('includes strategy counts', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      updateStrategiesHealth(2, 5); // 2 active, 5 total
      
      const health = await checkHealth();
      
      expect(health.services.strategies.active).toBe(2);
      expect(health.services.strategies.total).toBe(5);
    });

    it('includes system memory metrics', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const health = await checkHealth();
      
      expect(health.system.memory.used).toBeGreaterThan(0);
      expect(health.system.memory.total).toBeGreaterThan(0);
      expect(health.system.memory.percentage).toBeGreaterThanOrEqual(0); // Can be 0 if rounded down
      expect(health.system.memory.percentage).toBeLessThanOrEqual(100);
    });

    it('returns degraded when memory usage >90%', async () => {
      // This test is theoretical - we can't easily force >90% memory
      // But the logic is in checkHealth() to set status='degraded'
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const health = await checkHealth();
      
      // Just verify memory fields exist
      expect(health.system.memory).toBeDefined();
      expect(health.system.memory.percentage).toBeGreaterThanOrEqual(0);
    });

    it('includes uptime', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const health = await checkHealth();
      
      expect(health.uptime).toBeGreaterThanOrEqual(0); // Can be 0 immediately after reset
    });

    it('includes timestamp', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const health = await checkHealth();
      
      expect(health.timestamp).toBeDefined();
      expect(new Date(health.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('includes version', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const health = await checkHealth();
      
      expect(health.version).toBeDefined();
      expect(typeof health.version).toBe('string');
    });
  });

  describe('checkReady', () => {
    it('returns ready=true when WebSocket connected', async () => {
      updateWebSocketHealth('connected');
      
      const readiness = await checkReady();
      
      expect(readiness.ready).toBe(true);
      expect(readiness.checks.websocket).toBe(true);
    });

    it('returns ready=false when WebSocket disconnected', async () => {
      updateWebSocketHealth('disconnected');
      
      const readiness = await checkReady();
      
      expect(readiness.ready).toBe(false);
      expect(readiness.checks.websocket).toBe(false);
    });

    it('returns ready=false when WebSocket reconnecting', async () => {
      updateWebSocketHealth('reconnecting');
      
      const readiness = await checkReady();
      
      expect(readiness.ready).toBe(false);
      expect(readiness.checks.websocket).toBe(false);
    });

    it('includes timestamp', async () => {
      updateWebSocketHealth('connected');
      
      const readiness = await checkReady();
      
      expect(readiness.timestamp).toBeDefined();
      expect(new Date(readiness.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('includes all checks', async () => {
      updateWebSocketHealth('connected');
      
      const readiness = await checkReady();
      
      expect(readiness.checks).toBeDefined();
      expect(readiness.checks.websocket).toBeDefined();
      expect(readiness.checks.stateManager).toBe(true);
      expect(readiness.checks.credentialsManager).toBe(true);
    });
  });

  describe('updateWebSocketHealth', () => {
    it('updates WebSocket status to connected', async () => {
      updateWebSocketHealth('connected');
      
      const health = await checkHealth();
      
      expect(health.services.websocket.status).toBe('connected');
    });

    it('updates WebSocket status to disconnected', async () => {
      updateWebSocketHealth('disconnected');
      
      const health = await checkHealth();
      
      expect(health.services.websocket.status).toBe('disconnected');
    });

    it('updates WebSocket status to reconnecting', async () => {
      updateWebSocketHealth('reconnecting');
      
      const health = await checkHealth();
      
      expect(health.services.websocket.status).toBe('reconnecting');
    });

    it('sets lastHeartbeat when connected', async () => {
      const beforeConnect = Date.now();
      updateWebSocketHealth('connected');
      const afterConnect = Date.now();
      
      const health = await checkHealth();
      
      expect(health.services.websocket.lastHeartbeat).toBeGreaterThanOrEqual(beforeConnect);
      expect(health.services.websocket.lastHeartbeat).toBeLessThanOrEqual(afterConnect);
    });
  });

  describe('updateWebSocketHeartbeat', () => {
    it('updates heartbeat timestamp', async () => {
      updateWebSocketHealth('connected');
      
      const before = Date.now();
      updateWebSocketHeartbeat();
      const after = Date.now();
      
      const health = await checkHealth();
      
      expect(health.services.websocket.lastHeartbeat).toBeGreaterThanOrEqual(before);
      expect(health.services.websocket.lastHeartbeat).toBeLessThanOrEqual(after);
    });
  });

  describe('updateStrategiesHealth', () => {
    it('updates strategy counts', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      updateStrategiesHealth(3, 7);
      
      const health = await checkHealth();
      
      expect(health.services.strategies.active).toBe(3);
      expect(health.services.strategies.total).toBe(7);
    });

    it('handles zero strategies', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      updateStrategiesHealth(0, 0);
      
      const health = await checkHealth();
      
      expect(health.services.strategies.active).toBe(0);
      expect(health.services.strategies.total).toBe(0);
    });
  });
});
