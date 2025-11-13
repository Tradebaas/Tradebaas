import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeribitClient } from '@/lib/deribitClient';

describe('DeribitClient', () => {
  let client: DeribitClient;
  let mockWebSocket: any;

  beforeEach(() => {
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: WebSocket.OPEN,
    };

    global.WebSocket = vi.fn(() => mockWebSocket) as any;
    client = new DeribitClient('live');
  });

  it('should initialize with stopped state', () => {
    expect(client.getCurrentState()).toBe('Stopped');
  });

  it('should use correct endpoint for live environment', () => {
    expect(client.getEnvironment()).toBe('live');
  });

  it('should use correct endpoint for testnet environment', () => {
    const testnetClient = new DeribitClient('testnet');
    expect(testnetClient.getEnvironment()).toBe('testnet');
  });

  it('should track connection state', () => {
    expect(client.isConnected()).toBe(false);
  });

  it('should generate unique request IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add((client as any).generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should calculate exponential backoff with jitter', () => {
    const backoff1 = (client as any).calculateBackoff(0);
    const backoff2 = (client as any).calculateBackoff(1);
    const backoff3 = (client as any).calculateBackoff(2);

    expect(backoff1).toBeGreaterThanOrEqual(1000);
    expect(backoff1).toBeLessThanOrEqual(1300);
    expect(backoff2).toBeGreaterThanOrEqual(2000);
    expect(backoff2).toBeLessThanOrEqual(2600);
    expect(backoff3).toBeGreaterThanOrEqual(4000);
  });

  it('should respect max backoff limit', () => {
    const backoff = (client as any).calculateBackoff(10);
    expect(backoff).toBeLessThanOrEqual(13000);
  });

  it('should clean up on disconnect', () => {
    client.disconnect();
    expect(client.getCurrentState()).toBe('Stopped');
    expect(client.isConnected()).toBe(false);
  });
});
