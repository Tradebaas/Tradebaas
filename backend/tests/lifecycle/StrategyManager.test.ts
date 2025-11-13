/**
 * Test Suite: Strategy Lifecycle Manager
 * 
 * Tests:
 * - GUARD-002: Single strategy enforcement
 * - LIFECYCLE-001: State machine transitions
 * - State persistence across restarts
 * - Pause/resume analyzing based on position status
 * - Race condition prevention
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  StrategyManager, 
  StrategyLifecycleState,
  SingleStrategyViolationError,
  InvalidStateTransitionError
} from '../../src/lifecycle/StrategyManager';
import * as fs from 'fs/promises';

describe('StrategyManager - Single Strategy Guard (GUARD-002)', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should allow starting a strategy when none is active', async () => {
    expect(manager.isStrategyActive()).toBe(false);

    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    expect(manager.isStrategyActive()).toBe(true);
    expect(manager.getActiveStrategy()).toBe('Razor');
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.ANALYZING);
  });

  it('should throw SingleStrategyViolationError when trying to start second strategy', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    await expect(
      manager.startStrategy('SMC', 'ETH-PERPETUAL')
    ).rejects.toThrow(SingleStrategyViolationError);

    await expect(
      manager.startStrategy('SMC', 'ETH-PERPETUAL')
    ).rejects.toThrow('strategy "Razor" is already active');

    // Original strategy still active
    expect(manager.getActiveStrategy()).toBe('Razor');
  });

  it('should allow starting new strategy after stopping first one', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.stopStrategy();

    expect(manager.isStrategyActive()).toBe(false);

    await manager.startStrategy('SMC', 'ETH-PERPETUAL');

    expect(manager.isStrategyActive()).toBe(true);
    expect(manager.getActiveStrategy()).toBe('SMC');
  });

  it('should return null when no strategy is active', () => {
    expect(manager.getActiveStrategy()).toBeNull();
    expect(manager.isStrategyActive()).toBe(false);
  });

  it('should prevent starting strategy when in POSITION_OPEN state', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    await expect(
      manager.startStrategy('SMC', 'ETH-PERPETUAL')
    ).rejects.toThrow(SingleStrategyViolationError);
  });
});

describe('StrategyManager - Lifecycle State Machine (LIFECYCLE-001)', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should start in IDLE state', () => {
    const state = manager.getState();
    expect(state.state).toBe(StrategyLifecycleState.IDLE);
    expect(state.strategyName).toBeNull();
    expect(state.instrument).toBeNull();
  });

  it('should transition IDLE → ANALYZING when strategy starts', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    const state = manager.getState();
    expect(state.state).toBe(StrategyLifecycleState.ANALYZING);
    expect(state.strategyName).toBe('Razor');
    expect(state.instrument).toBe('BTC-PERPETUAL');
    expect(state.startedAt).toBeGreaterThan(0);
  });

  it('should transition ANALYZING → SIGNAL_DETECTED when signal found', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    
    await manager.onSignalDetected({ signalType: 'LONG', strength: 0.85 });

    const state = manager.getState();
    expect(state.state).toBe(StrategyLifecycleState.SIGNAL_DETECTED);
    expect(state.metadata.signalType).toBe('LONG');
    expect(state.metadata.strength).toBe(0.85);
  });

  it('should transition SIGNAL_DETECTED → ENTERING_POSITION', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();

    await manager.onEnteringPosition();

    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.ENTERING_POSITION);
  });

  it('should transition ENTERING_POSITION → POSITION_OPEN', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();

    await manager.onPositionOpened(50000, 100, 'long');

    const state = manager.getState();
    expect(state.state).toBe(StrategyLifecycleState.POSITION_OPEN);
    expect(state.positionEntryPrice).toBe(50000);
    expect(state.positionSize).toBe(100);
    expect(state.positionSide).toBe('long');
  });

  it('should transition POSITION_OPEN → CLOSING → ANALYZING', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    await manager.onPositionClosing();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.CLOSING);

    await manager.onPositionClosed();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.ANALYZING);

    // Position data cleared
    const state = manager.getState();
    expect(state.positionEntryPrice).toBeNull();
    expect(state.positionSize).toBeNull();
    expect(state.positionSide).toBeNull();
  });

  it('should transition ANALYZING → IDLE when strategy stops', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    await manager.stopStrategy();

    const state = manager.getState();
    expect(state.state).toBe(StrategyLifecycleState.IDLE);
    expect(state.strategyName).toBeNull();
    expect(state.instrument).toBeNull();
  });

  it('should throw InvalidStateTransitionError on invalid transition', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    // Can't go directly from ANALYZING to POSITION_OPEN
    await expect(
      manager.onPositionOpened(50000, 100, 'long')
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it('should complete full lifecycle: IDLE → ANALYZING → ... → ANALYZING → IDLE', async () => {
    // Start
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.ANALYZING);

    // Signal
    await manager.onSignalDetected();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.SIGNAL_DETECTED);

    // Enter
    await manager.onEnteringPosition();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.ENTERING_POSITION);

    // Open
    await manager.onPositionOpened(50000, 100, 'long');
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.POSITION_OPEN);

    // Close
    await manager.onPositionClosing();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.CLOSING);

    // Back to analyzing
    await manager.onPositionClosed();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.ANALYZING);

    // Stop
    await manager.stopStrategy();
    expect(manager.getCurrentState()).toBe(StrategyLifecycleState.IDLE);
  });
});

describe('StrategyManager - Pause/Resume Analyzing', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should allow analyzing when in ANALYZING state', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    expect(manager.shouldAnalyze()).toBe(true);
  });

  it('should pause analyzing when position is open', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    expect(manager.shouldAnalyze()).toBe(false);
  });

  it('should resume analyzing after position closes', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    expect(manager.shouldAnalyze()).toBe(false);

    await manager.onPositionClosing();
    await manager.onPositionClosed();

    expect(manager.shouldAnalyze()).toBe(true);
  });

  it('should not allow analyzing when closing position', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');
    await manager.onPositionClosing();

    expect(manager.shouldAnalyze()).toBe(false);
  });
});

describe('StrategyManager - Position Guard', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should allow opening position when in ANALYZING state', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    expect(manager.canOpenPosition()).toBe(true);
  });

  it('should allow opening position when in SIGNAL_DETECTED state', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();

    expect(manager.canOpenPosition()).toBe(true);
  });

  it('should block opening position when already in position', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    expect(manager.canOpenPosition()).toBe(false);
  });

  it('should block opening position when entering position', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();

    expect(manager.canOpenPosition()).toBe(false);
  });
});

describe('StrategyManager - State Persistence (LIFECYCLE-001)', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should persist state to disk on transitions', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    // Create new instance to simulate restart
    const manager2 = StrategyManager.getInstance();
    await manager2.initialize();

    const state = manager2.getState();
    expect(state.state).toBe(StrategyLifecycleState.ANALYZING);
    expect(state.strategyName).toBe('Razor');
    expect(state.instrument).toBe('BTC-PERPETUAL');
  });

  it('should persist position data across restart', async () => {
    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');

    // Simulate restart
    const manager2 = StrategyManager.getInstance();
    await manager2.initialize();

    const state = manager2.getState();
    expect(state.state).toBe(StrategyLifecycleState.POSITION_OPEN);
    expect(state.positionEntryPrice).toBe(50000);
    expect(state.positionSize).toBe(100);
    expect(state.positionSide).toBe('long');
  });

  it('should handle missing state file gracefully', async () => {
    // Remove state file if it exists
    try {
      await fs.unlink('./data/strategy-state.json');
    } catch {}

    const manager2 = StrategyManager.getInstance();
    await manager2.initialize();

    expect(manager2.getCurrentState()).toBe(StrategyLifecycleState.IDLE);
  });
});

describe('StrategyManager - Event Emissions', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should emit stateChange event on transitions', async () => {
    const eventSpy = vi.fn();
    manager.on('stateChange', eventSpy);

    await manager.startStrategy('Razor', 'BTC-PERPETUAL');

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: StrategyLifecycleState.IDLE,
        to: StrategyLifecycleState.ANALYZING,
        state: expect.objectContaining({
          strategyName: 'Razor',
          instrument: 'BTC-PERPETUAL',
        }),
      })
    );
  });

  it('should emit event for each transition in full lifecycle', async () => {
    const events: any[] = [];
    manager.on('stateChange', (event) => events.push(event));

    await manager.startStrategy('Razor', 'BTC-PERPETUAL');
    await manager.onSignalDetected();
    await manager.onEnteringPosition();
    await manager.onPositionOpened(50000, 100, 'long');
    await manager.onPositionClosing();
    await manager.onPositionClosed();
    await manager.stopStrategy();

    expect(events).toHaveLength(7);
    expect(events[0].to).toBe(StrategyLifecycleState.ANALYZING);
    expect(events[1].to).toBe(StrategyLifecycleState.SIGNAL_DETECTED);
    expect(events[2].to).toBe(StrategyLifecycleState.ENTERING_POSITION);
    expect(events[3].to).toBe(StrategyLifecycleState.POSITION_OPEN);
    expect(events[4].to).toBe(StrategyLifecycleState.CLOSING);
    expect(events[5].to).toBe(StrategyLifecycleState.ANALYZING);
    expect(events[6].to).toBe(StrategyLifecycleState.IDLE);
  });
});

describe('StrategyManager - Race Conditions (TEST-008 Preview)', () => {
  let manager: StrategyManager;

  beforeEach(async () => {
    manager = StrategyManager.getInstance();
    await manager.reset();
  });

  it('should prevent simultaneous strategy starts', async () => {
    const promises = [
      manager.startStrategy('Razor', 'BTC-PERPETUAL'),
      manager.startStrategy('SMC', 'ETH-PERPETUAL'),
    ];

    const results = await Promise.allSettled(promises);

    // One should succeed, one should fail
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as any).reason).toBeInstanceOf(SingleStrategyViolationError);
  });
});
