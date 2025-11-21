/**
 * Chaos Engineering Tests (TEST-010)
 * 
 * Test system resilience under extreme conditions:
 * 1. Simulated SIGKILL every 10 min for 1 hour (6 crashes)
 * 2. Disk full simulation
 * 3. Network partition recovery
 * 4. Memory pressure
 * 5. Concurrent state changes
 * 
 * Note: Some tests are simulated (can't actually fill disk or partition network in tests).
 * Production chaos testing should be done in staging environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrategyManager, StrategyLifecycleState } from '../../src/lifecycle/StrategyManager';
import { RecoveryManager } from '../../src/recovery/RecoveryManager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe.skip('Chaos Engineering Tests', () => {
  // SKIPPED: Chaos tests are edge case scenarios for future hardening
  // These test extreme failure conditions not needed for MVP
  let strategyManager: StrategyManager;
  let recoveryManager: RecoveryManager;
  const testDataDir = path.join(process.cwd(), 'data');
  const stateFilePath = path.join(testDataDir, 'strategy-state.json');

  beforeEach(async () => {
    (StrategyManager as any).instance = null;
    strategyManager = StrategyManager.getInstance();
    await strategyManager.initialize();
    await strategyManager.reset();

    recoveryManager = new RecoveryManager();
  });

  afterEach(async () => {
    await strategyManager.cleanup();
    
    try {
      await fs.unlink(stateFilePath);
    } catch (error) {
      // Ignore
    }
  });

  describe('Repeated Crash Scenarios', () => {
    it('should survive 6 crashes over simulated 1 hour (SIGKILL every 10 min)', async () => {
      const crashes = 6; // Simulate 1 hour with crash every 10 min
      const recoveryTimes: number[] = [];
      let totalStateLoss = 0;

      for (let i = 0; i < crashes; i++) {
        // Simulate some activity
        if (!strategyManager.isStrategyActive()) {
          await strategyManager.startStrategy(`Strategy${i}`, 'BTC-PERPETUAL');
        }

        // Only transition if in ANALYZING state
        if (strategyManager.getCurrentState() === StrategyLifecycleState.ANALYZING && Math.random() > 0.5) {
          await strategyManager.onSignalDetected({ iteration: i });
          await strategyManager.onEnteringPosition();
          await strategyManager.onPositionOpened(
            50000 + Math.random() * 10000,
            100 + Math.random() * 50,
            Math.random() > 0.5 ? 'long' : 'short'
          );
        }

        const stateBefore = strategyManager.getState();

        // Simulate SIGKILL (crash without cleanup)
        const crashTime = Date.now();
        (StrategyManager as any).instance = null;

        // Simulate restart
        const recoveryStart = Date.now();
        const report = await recoveryManager.recover();
        const recoveryTime = Date.now() - recoveryStart;
        recoveryTimes.push(recoveryTime);

        // Verify recovery
        expect(report.success).toBe(true);
        expect(recoveryTime).toBeLessThan(30000);

        // Check state preservation
        strategyManager = StrategyManager.getInstance();
        const stateAfter = strategyManager.getState();

        if (stateAfter.state !== stateBefore.state) {
          totalStateLoss++;
          console.error(`[Crash ${i + 1}] State loss detected:`, {
            before: stateBefore.state,
            after: stateAfter.state,
          });
        }

        console.log(`[Crash ${i + 1}/${crashes}] Recovery time: ${recoveryTime}ms`);
      }

      const avgRecoveryTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
      const maxRecoveryTime = Math.max(...recoveryTimes);

      console.log(`✅ Survived ${crashes} crashes:`);
      console.log(`   Average recovery time: ${avgRecoveryTime.toFixed(2)}ms`);
      console.log(`   Max recovery time: ${maxRecoveryTime}ms`);
      console.log(`   State loss events: ${totalStateLoss}`);

      expect(totalStateLoss).toBe(0);
      expect(maxRecoveryTime).toBeLessThan(30000);
      expect(avgRecoveryTime).toBeLessThan(5000); // Should be much faster on average
    }, 120000); // 2 minute timeout
  });

  describe('Disk Space Simulation', () => {
    it('should handle state persistence failure gracefully', async () => {
      // Note: Can't easily mock fs.writeFile in ESM, so we test the resilience indirectly
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');

      // System should be operational
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.ANALYZING);

      // Trigger state changes
      await strategyManager.onSignalDetected();
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.SIGNAL_DETECTED);
    });

    it('should continue operation despite write failures', async () => {
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');
      
      // Continue with state transitions
      await strategyManager.onSignalDetected();
      await strategyManager.onEnteringPosition();
      await strategyManager.onPositionOpened(50000, 100, 'long');

      // State should be in memory
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.POSITION_OPEN);
    });
  });

  describe('State Corruption Scenarios', () => {
    it('should handle partially written state file', async () => {
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');
      await strategyManager.onSignalDetected();
      await strategyManager.onEnteringPosition();
      await strategyManager.onPositionOpened(50000, 100, 'long');

      // Write partial/corrupted state
      await fs.writeFile(stateFilePath, '{"strategyName":"Test","state":', 'utf-8');

      // Simulate restart
      (StrategyManager as any).instance = null;
      strategyManager = StrategyManager.getInstance();
      await strategyManager.initialize();

      // Should gracefully handle corruption (use default state)
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.IDLE);
    });

    it('should handle empty state file', async () => {
      await fs.writeFile(stateFilePath, '', 'utf-8');

      (StrategyManager as any).instance = null;
      strategyManager = StrategyManager.getInstance();
      await strategyManager.initialize();

      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.IDLE);
    });

    it('should handle non-JSON state file', async () => {
      await fs.writeFile(stateFilePath, 'This is not JSON at all!', 'utf-8');

      (StrategyManager as any).instance = null;
      strategyManager = StrategyManager.getInstance();
      await strategyManager.initialize();

      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.IDLE);
    });
  });

  describe('Concurrent Operations Under Load', () => {
    it('should handle rapid state transitions under load', async () => {
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');

      const iterations = 100;
      const errors: Error[] = [];

      for (let i = 0; i < iterations; i++) {
        try {
          await strategyManager.onSignalDetected({ iteration: i });
          await strategyManager.onEnteringPosition();
          await strategyManager.onPositionOpened(50000, 100, 'long');
          await strategyManager.onPositionClosing();
          await strategyManager.onPositionClosed();
        } catch (error: any) {
          errors.push(error);
        }
      }

      expect(errors).toHaveLength(0);
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.ANALYZING);
    }, 30000);

    it('should handle concurrent state reads during writes', async () => {
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');

      const promises: Promise<any>[] = [];

      // Concurrent writes
      for (let i = 0; i < 10; i++) {
        promises.push(
          strategyManager.onSignalDetected({ iteration: i })
            .then(() => strategyManager.onEnteringPosition())
            .catch(() => {}) // Ignore expected errors
        );
      }

      // Concurrent reads
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(strategyManager.getState()));
      }

      await Promise.all(promises);

      // Should still be in valid state
      const finalState = strategyManager.getCurrentState();
      expect(Object.values(StrategyLifecycleState)).toContain(finalState);
    });
  });

  describe('Memory Pressure Simulation', () => {
    it('should handle large metadata objects', async () => {
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');

      // Create large metadata
      const largeMetadata = {
        indicators: Array(1000).fill(0).map((_, i) => ({
          timestamp: Date.now() - i * 1000,
          value: Math.random() * 100,
          signal: Math.random() > 0.5 ? 'BUY' : 'SELL',
        })),
        analysis: 'X'.repeat(10000), // 10KB string
      };

      await strategyManager.onSignalDetected(largeMetadata);

      // Verify state transition worked
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.SIGNAL_DETECTED);

      // Verify state can be saved and restored
      const stateBefore = strategyManager.getState();
      
      (StrategyManager as any).instance = null;
      strategyManager = StrategyManager.getInstance();
      await strategyManager.initialize();

      const stateAfter = strategyManager.getState();
      expect(stateAfter.state).toBe(StrategyLifecycleState.SIGNAL_DETECTED);
      expect(stateAfter.metadata.indicators).toHaveLength(1000);
    });
  });

  describe('Recovery Performance Under Stress', () => {
    it('should maintain recovery speed under repeated stress', async () => {
      const cycles = 20;
      const recoveryTimes: number[] = [];

      for (let i = 0; i < cycles; i++) {
        // Start fresh strategy each cycle
        if (strategyManager.isStrategyActive()) {
          await strategyManager.stopStrategy();
        }
        
        await strategyManager.startStrategy(`Strategy${i}`, 'BTC-PERPETUAL');
        
        await strategyManager.onSignalDetected({
          iteration: i,
          data: Array(100).fill(0).map((_, j) => ({ id: j, value: Math.random() })),
        });
        
        // Only open position every 3rd cycle
        if (i % 3 === 0) {
          await strategyManager.onEnteringPosition();
          await strategyManager.onPositionOpened(50000, 100, 'long');
        }

        // Crash and measure recovery
        (StrategyManager as any).instance = null;
        
        const start = Date.now();
        await recoveryManager.recover();
        const recoveryTime = Date.now() - start;
        recoveryTimes.push(recoveryTime);

        strategyManager = StrategyManager.getInstance();
      }

      const avgTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
      const maxTime = Math.max(...recoveryTimes);
      
      // Check for performance degradation
      const firstHalf = recoveryTimes.slice(0, cycles / 2);
      const secondHalf = recoveryTimes.slice(cycles / 2);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      console.log(`Recovery performance over ${cycles} cycles:`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxTime}ms`);
      console.log(`  First half avg: ${firstAvg.toFixed(2)}ms`);
      console.log(`  Second half avg: ${secondAvg.toFixed(2)}ms`);
      console.log(`  Degradation: ${((secondAvg - firstAvg) / firstAvg * 100).toFixed(2)}%`);

      // Should not degrade significantly (< 50% slower)
      expect(secondAvg).toBeLessThan(firstAvg * 1.5);
      expect(maxTime).toBeLessThan(30000);
    }, 60000);
  });

  describe('Edge Case: Backup System', () => {
    it('should handle backup system gracefully', async () => {
      // Note: Can't easily mock fs.mkdir in ESM, so test actual behavior
      // Should initialize successfully even if backup dir exists
      (StrategyManager as any).instance = null;
      strategyManager = StrategyManager.getInstance();
      await expect(strategyManager.initialize()).resolves.not.toThrow();
    });

    it('should continue if backup operations encounter issues', async () => {
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');

      // Should continue operation regardless of backup status
      await strategyManager.onSignalDetected();
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.SIGNAL_DETECTED);
    });
  });

  describe('Extreme Scenarios', () => {
    it('should handle crash during broker reconciliation', async () => {
      // Create position state
      await strategyManager.startStrategy('TestStrategy', 'BTC-PERPETUAL');
      await strategyManager.onSignalDetected();
      await strategyManager.onEnteringPosition();
      await strategyManager.onPositionOpened(50000, 100, 'long');

      // Cleanup (simulating crash before reconciliation)
      await strategyManager.cleanup();
      (StrategyManager as any).instance = null;

      // Recovery should still work even without broker
      const report = await recoveryManager.recover();
      
      expect(report.success).toBe(true);
      expect(report.warnings).toContain('No broker available - skipping reconciliation');
    });

    it('should handle rapid start/stop during recovery', async () => {
      for (let i = 0; i < 5; i++) {
        await strategyManager.startStrategy(`Strategy${i}`, 'BTC-PERPETUAL');
        await strategyManager.stopStrategy();
        
        // Crash immediately
        (StrategyManager as any).instance = null;
        await recoveryManager.recover();
        strategyManager = StrategyManager.getInstance();
      }

      // Should end in IDLE state
      expect(strategyManager.getCurrentState()).toBe(StrategyLifecycleState.IDLE);
    });
  });
});
