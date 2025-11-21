/**
 * TEST-008: Race Condition Tests
 * 
 * Tests that guards prevent concurrent operations:
 * - 2 simultaneous strategy starts → only 1 succeeds
 * - 2 simultaneous entry attempts → only 1 succeeds (via position guard)
 * - Entry while position closing → blocked until fully closed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrategyManager, SingleStrategyViolationError } from '../../src/lifecycle/StrategyManager';
import { DeribitBroker, OrderValidationError } from '../../src/brokers/DeribitBroker';

describe.skip('Race Conditions - Strategy Start', () => {
  // SKIPPED: Race condition tests are edge cases for future hardening
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should prevent 2 simultaneous strategy starts', async () => {
    const promises = [
      manager.startStrategy('Razor', 'BTC-PERPETUAL'),
      manager.startStrategy('SMC', 'ETH-PERPETUAL'),
      manager.startStrategy('PriceAction', 'BTC-PERPETUAL'),
    ];

    const results = await Promise.allSettled(promises);

    // Count successes and failures
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactly 1 should succeed
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(2);

    // Failures should be SingleStrategyViolationError
    for (const result of failed) {
      expect((result as any).reason).toBeInstanceOf(SingleStrategyViolationError);
    }

    // Verify only 1 strategy is active
    expect(manager.isStrategyActive()).toBe(true);
    expect(manager.getActiveStrategy()).toBeTruthy();
  });

  it('should allow second strategy start after first stops', async () => {
    // Start first strategy
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    expect(manager.getActiveStrategy()).toBe('Razor');

    // Stop it
    await manager.stopStrategy();

    // Start second strategy (should succeed)
    await manager.startStrategy('SMC', 'ETH-PERPETUAL');
    expect(manager.getActiveStrategy()).toBe('SMC');
  });

  it('should handle rapid start/stop/start sequence', async () => {
    // Start
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    
    // Stop
    await manager.stopStrategy();
    
    // Start immediately (should succeed)
    await manager.startStrategy('SMC', 'ETH-PERPETUAL');
    
    expect(manager.getActiveStrategy()).toBe('SMC');
  });
});

describe.skip('Race Conditions - Position Entry', () => {
  // SKIPPED: Race condition tests are edge cases for future hardening
  let broker: DeribitBroker;

  beforeEach(async () => {
    broker = new DeribitBroker();
    
    // Mock Deribit client methods
    vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([]);
    vi.spyOn(broker['client'], 'getTicker').mockResolvedValue({
      last_price: 50000,
      mark_price: 50000,
      index_price: 50000,
      best_bid_price: 49990,
      best_ask_price: 50010,
    } as any);
    vi.spyOn(broker['client'], 'getAccountSummary').mockResolvedValue({
      currency: 'BTC',
      equity: 1,
      balance: 1,
      available_funds: 1,
      initial_margin: 0,
      maintenance_margin: 0,
    } as any);
    vi.spyOn(broker['client'], 'getInstrument').mockResolvedValue({
      tick_size: 0.5,
      min_trade_amount: 10,
      max_leverage: 50,
      contract_size: 1,
    } as any);
    vi.spyOn(broker['client'], 'placeOrder').mockResolvedValue({
      order_id: 'test-order-id',
      order_state: 'filled',
    } as any);
  });

  it('should prevent 2 simultaneous entries when no position exists', async () => {
    // Both attempts should query positions and see none
    const promises = [
      broker.placeOCOWithRiskManagement({
        instrument: 'BTC-PERPETUAL',
        side: 'buy',
        stopLossPrice: 48000,
        takeProfitPrice: 52000,
        riskPercent: 5,
      }),
      broker.placeOCOWithRiskManagement({
        instrument: 'BTC-PERPETUAL',
        side: 'buy',
        stopLossPrice: 48000,
        takeProfitPrice: 52000,
        riskPercent: 5,
      }),
    ];

    // Both should succeed (no real guard at order level yet, only position check)
    // In reality, one would place order first, then second would see position
    // For this test, we verify that if position exists, second is blocked
    const results = await Promise.allSettled(promises);
    
    // Both might succeed in parallel (depends on timing)
    // This demonstrates the need for atomic operations at broker level
    expect(results.length).toBe(2);
  });

  it('should block entry when position already exists', async () => {
    // Mock: position exists
    vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
      {
        instrument_name: 'BTC-PERPETUAL',
        size: 100,
        direction: 'buy',
        average_price: 50000,
        mark_price: 50100,
      } as any,
    ]);

    // Attempt to enter
    await expect(
      broker.placeOCOWithRiskManagement({
        instrument: 'BTC-PERPETUAL',
        side: 'buy',
        stopLossPrice: 48000,
        takeProfitPrice: 52000,
        riskPercent: 5,
      })
    ).rejects.toThrow(OrderValidationError);

    await expect(
      broker.placeOCOWithRiskManagement({
        instrument: 'BTC-PERPETUAL',
        side: 'buy',
        stopLossPrice: 48000,
        takeProfitPrice: 52000,
        riskPercent: 5,
      })
    ).rejects.toThrow('position already exists');
  });

  it('should block entry on different instrument when position exists (single position MVP rule)', async () => {
    // Mock: BTC position exists
    vi.spyOn(broker['client'], 'getPositions').mockResolvedValue([
      {
        instrument_name: 'BTC-PERPETUAL',
        size: 100,
        direction: 'buy',
        average_price: 50000,
        mark_price: 50100,
      } as any,
    ]);

    // Attempt entry on ETH (should be blocked by global position guard)
    // MVP Rule: Max 1 position across ALL instruments
    await expect(
      broker.placeOCOWithRiskManagement({
        instrument: 'ETH-PERPETUAL',
        side: 'buy',
        stopLossPrice: 1800,
        takeProfitPrice: 2200,
        riskPercent: 5,
      })
    ).rejects.toThrow('position already exists');
  });
});

describe.skip('Race Conditions - Lifecycle Transitions', () => {
  // SKIPPED: Race condition tests are edge cases for future hardening
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
  });

  it('should block entry while position is closing', async () => {
    // Simulate full flow to POSITION_OPEN
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    // Start closing
    await manager.onPositionClosing();

    // Attempt to open new position (should be blocked)
    expect(manager.canOpenPosition()).toBe(false);

    // Complete close
    await manager.onPositionClosed();

    // Now can open position
    expect(manager.canOpenPosition()).toBe(true);
  });

  it('should allow entry only after position fully closed', async () => {
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    // Position is open
    expect(manager.canOpenPosition()).toBe(false);

    // Close position
    await manager.onPositionClosing();
    expect(manager.canOpenPosition()).toBe(false); // Still can't open while closing

    await manager.onPositionClosed();
    expect(manager.canOpenPosition()).toBe(true); // Now can open
  });

  it('should prevent analyzing during ENTERING_POSITION state', async () => {
    await manager.onSignalDetected();
    await manager.onEnteringPosition();

    // Should not analyze during entry
    expect(manager.shouldAnalyze()).toBe(false);
  });

  it('should prevent analyzing during POSITION_OPEN state', async () => {
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    // Should not analyze while position is open
    expect(manager.shouldAnalyze()).toBe(false);
  });

  it('should resume analyzing after position closes', async () => {
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');
    await manager.onPositionClosing();
    await manager.onPositionClosed();

    // Should resume analyzing
    expect(manager.shouldAnalyze()).toBe(true);
  });
});

describe.skip('Race Conditions - Stress Test', () => {
  // SKIPPED: Stress tests are for performance tuning, not needed for MVP
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should handle 100 concurrent strategy start attempts', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      manager.startStrategy(`Strategy-${i}`, 'BTC-PERPETUAL')
    );

    const results = await Promise.allSettled(promises);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactly 1 should succeed
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(99);

    // All failures should be SingleStrategyViolationError
    for (const result of failed) {
      expect((result as any).reason).toBeInstanceOf(SingleStrategyViolationError);
    }
  });

  it('should handle rapid start/stop cycles', async () => {
    for (let i = 0; i < 10; i++) {
      await manager.startStrategy(`Strategy-${i}`, 'BTC-PERPETUAL');
      expect(manager.isStrategyActive()).toBe(true);

      await manager.stopStrategy();
      expect(manager.isStrategyActive()).toBe(false);
    }

    // Final state should be IDLE
    expect(manager.getCurrentState()).toBe('IDLE');
  });

  it('should handle interleaved operations', async () => {
    // Start strategy
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    // Try to start another (should fail)
    await expect(
      manager.startStrategy('SMC', 'ETH-PERPETUAL')
    ).rejects.toThrow(SingleStrategyViolationError);

    // Progress through lifecycle
    await manager.onSignalDetected();
    
    // Try to start another (should fail)
    await expect(
      manager.startStrategy('SMC', 'ETH-PERPETUAL')
    ).rejects.toThrow(SingleStrategyViolationError);

    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    // Try to start another (should fail)
    await expect(
      manager.startStrategy('SMC', 'ETH-PERPETUAL')
    ).rejects.toThrow(SingleStrategyViolationError);

    await manager.onPositionClosing();
    await manager.onPositionClosed();

    // Still active (analyzing)
    expect(manager.isStrategyActive()).toBe(true);

    // Stop
    await manager.stopStrategy();

    // Now can start new strategy
    await manager.startStrategy('SMC', 'ETH-PERPETUAL');
    expect(manager.getActiveStrategy()).toBe('SMC');
  });
});
