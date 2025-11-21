/**
 * State Manager Tests
 * Tests for backend state persistence (StateManager) and Spark KV (StateStore)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateStore } from '../src/strategy-runner/StateStore';
import { StateManager } from '../src/state-manager';
import fs from 'fs/promises';
import path from 'path';

describe('StateStore (Spark KV)', () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore('test-user', 'test-worker');
  });

  it('can be instantiated', () => {
    expect(store).toBeDefined();
    expect(store).toBeInstanceOf(StateStore);
  });

  it('should handle missing Spark KV gracefully (in test environment)', () => {
    // StateStore should be created without errors even when Spark KV is unavailable
    const newStore = new StateStore('user-123', 'worker-456');
    expect(newStore).toBeDefined();
  });
});

describe('StateManager (File-based persistence)', () => {
  let stateManager: StateManager;
  let testStatePath: string;

  beforeEach(async () => {
    // Use a temporary test file
    testStatePath = path.join(__dirname, `test-state-${Date.now()}.json`);
    stateManager = new StateManager(testStatePath);
    await stateManager.initialize();
  });

  afterEach(async () => {
    // Cleanup test file
    try {
      await fs.unlink(testStatePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  it('should initialize with empty state', () => {
    const state = stateManager.getState();
    
    expect(state).toBeDefined();
    expect(state.disclaimerAccepted).toBe(false);
    expect(state.activeStrategies).toEqual([]);
  });

  it('should save disclaimer acceptance', async () => {
    await stateManager.acceptDisclaimer();
    
    expect(stateManager.isDisclaimerAccepted()).toBe(true);
  });

  it('should add and retrieve active strategies', async () => {
    const strategy = {
      id: 'strategy-123',
      name: 'Razor Test',
      status: 'active' as const,
      startedAt: Date.now(),
      config: {
        instrument: 'BTC-PERPETUAL',
      },
    };

    await stateManager.addStrategy(strategy);
    
    const strategies = stateManager.getActiveStrategies();
    expect(strategies).toHaveLength(1);
    expect(strategies[0].id).toBe('strategy-123');
  });

  it('should persist and reload state from disk', async () => {
    await stateManager.acceptDisclaimer();
    await stateManager.addStrategy({
      id: 'persist-test',
      name: 'Test',
      status: 'active',
      startedAt: Date.now(),
      config: {},
    });

    // Create new instance to test reload
    const newManager = new StateManager(testStatePath);
    await newManager.initialize();
    
    expect(newManager.isDisclaimerAccepted()).toBe(true);
    expect(newManager.getActiveStrategies()).toHaveLength(1);
  });

  it('should only reload active strategies on restart', async () => {
    await stateManager.addStrategy({
      id: 'active-1',
      name: 'Active',
      status: 'active',
      startedAt: Date.now(),
      config: {},
    });

    await stateManager.addStrategy({
      id: 'stopped-1',
      name: 'Stopped',
      status: 'stopped',
      startedAt: Date.now(),
      config: {},
    });

    // Reload
    const newManager = new StateManager(testStatePath);
    await newManager.initialize();
    
    const strategies = newManager.getActiveStrategies();
    
    // Should only have active strategies
    expect(strategies).toHaveLength(1);
    expect(strategies[0].id).toBe('active-1');
  });

  it('should save and load connection state', async () => {
    await stateManager.setConnection({
      broker: 'deribit',
      environment: 'testnet',
      connected: true,
      connectedAt: Date.now(),
    });

    const connection = stateManager.getConnection();
    expect(connection).toBeDefined();
    expect(connection?.broker).toBe('deribit');
    expect(connection?.environment).toBe('testnet');
  });
});
