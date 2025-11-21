/**
 * Health Endpoint Integration Tests
 * Tests /health and /ready HTTP endpoints with actual server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { 
  checkHealth, 
  checkReady, 
  updateWebSocketHealth, 
  updateWebSocketHeartbeat,
  updateStrategiesHealth 
} from '../src/health';
import { MetricsCollector } from '../src/monitoring/metrics';

describe('Health Endpoints (Integration)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    // Mock MetricsCollector broker to always be healthy
    const metrics = MetricsCollector.getInstance();
    vi.spyOn(metrics as any, 'brokerConnected', 'get').mockReturnValue(true);
    
    // Create test server with health endpoints
    server = Fastify({
      logger: false,
    });

    await server.register(cors, {
      origin: true,
      credentials: true,
    });

    // Health check endpoint - same as production
    server.get('/health', async (request, reply) => {
      try {
        const health = await checkHealth();
        
        const statusCode = health.status === 'unhealthy' ? 503 : 200;
        
        return reply.code(statusCode).send(health);
      } catch (error: unknown) {
        request.log.error({ error }, 'Health check failed');
        return reply.code(503).send({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Readiness check endpoint - same as production
    server.get('/ready', async (request, reply) => {
      try {
        const readiness = await checkReady();
        
        const statusCode = readiness.ready ? 200 : 503;
        
        return reply.code(statusCode).send(readiness);
      } catch (error: unknown) {
        request.log.error({ error }, 'Readiness check failed');
        return reply.code(503).send({
          ready: false,
          error: 'Readiness check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    await server.listen({ port: 0 }); // Random available port
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Reset health state before each test
    updateWebSocketHealth('disconnected');
    updateStrategiesHealth(0, 0);
  });

  describe('GET /health', () => {
    it('returns 200 when healthy', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.services.websocket.status).toBe('connected');
    });

    it('returns 503 when unhealthy (WebSocket disconnected)', async () => {
      updateWebSocketHealth('disconnected');
      
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(503);
      
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      expect(body.services.websocket.status).toBe('disconnected');
    });

    it('returns 200 when degraded (not 503)', async () => {
      updateWebSocketHealth('reconnecting');
      
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.services.websocket.status).toBe('reconnecting');
    });

    it('includes all required fields', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      updateStrategiesHealth(1, 2);
      
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      
      // Top-level fields
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('version');
      
      // Services
      expect(body.services).toHaveProperty('websocket');
      expect(body.services.websocket).toHaveProperty('status');
      expect(body.services.websocket).toHaveProperty('lastHeartbeat');
      
      expect(body.services).toHaveProperty('strategies');
      expect(body.services.strategies).toHaveProperty('active');
      expect(body.services.strategies).toHaveProperty('total');
      
      // System
      expect(body.system).toHaveProperty('memory');
      expect(body.system.memory).toHaveProperty('used');
      expect(body.system.memory).toHaveProperty('total');
      expect(body.system.memory).toHaveProperty('percentage');
      expect(body.system).toHaveProperty('cpu');
    });

    it('returns valid JSON', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.headers['content-type']).toContain('application/json');
      expect(() => JSON.parse(response.body)).not.toThrow();
    });

    it('responds quickly (<10ms)', async () => {
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      const start = Date.now();
      
      await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10);
    });
  });

  describe('GET /ready', () => {
    it('returns 200 when ready', async () => {
      updateWebSocketHealth('connected');
      
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
      expect(body.checks.websocket).toBe(true);
    });

    it('returns 503 when not ready (WebSocket disconnected)', async () => {
      updateWebSocketHealth('disconnected');
      
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });
      
      expect(response.statusCode).toBe(503);
      
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(false);
      expect(body.checks.websocket).toBe(false);
    });

    it('returns 503 when WebSocket reconnecting', async () => {
      updateWebSocketHealth('reconnecting');
      
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });
      
      expect(response.statusCode).toBe(503);
      
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(false);
    });

    it('includes all check fields', async () => {
      updateWebSocketHealth('connected');
      
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });
      
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('ready');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('checks');
      expect(body.checks).toHaveProperty('websocket');
      expect(body.checks).toHaveProperty('stateManager');
      expect(body.checks).toHaveProperty('credentialsManager');
    });

    it('returns valid JSON', async () => {
      updateWebSocketHealth('connected');
      
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });
      
      expect(response.headers['content-type']).toContain('application/json');
      expect(() => JSON.parse(response.body)).not.toThrow();
    });
  });

  describe('Health Status Transitions', () => {
    it('transitions from unhealthy to healthy when WebSocket connects', async () => {
      // Start unhealthy
      updateWebSocketHealth('disconnected');
      
      let response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(503);
      let body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      
      // Connect WebSocket
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
    });

    it('transitions from healthy to degraded when reconnecting', async () => {
      // Start healthy
      updateWebSocketHealth('connected');
      updateWebSocketHeartbeat();
      
      let response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      let body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      
      // Start reconnecting
      updateWebSocketHealth('reconnecting');
      
      response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200); // Still 200, but degraded
      body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
    });

    it('transitions from degraded to unhealthy when disconnect fails', async () => {
      // Start reconnecting (degraded)
      updateWebSocketHealth('reconnecting');
      
      let response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      let body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      
      // Reconnect fails (disconnected)
      updateWebSocketHealth('disconnected');
      
      response = await server.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(503);
      body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
    });
  });
});
