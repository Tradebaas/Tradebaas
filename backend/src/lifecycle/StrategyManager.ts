/**
 * Strategy Lifecycle Manager
 * 
 * Manages strategy lifecycle states and enforces single-strategy constraint.
 * States: IDLE → ANALYZING → SIGNAL_DETECTED → ENTERING_POSITION → POSITION_OPEN → CLOSING → IDLE
 * 
 * Features:
 * - Single strategy enforcement (GUARD-002)
 * - State machine implementation (LIFECYCLE-001)
 * - State persistence across restarts
 * - Automatic pause/resume based on position status
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum StrategyLifecycleState {
  IDLE = 'IDLE',                           // No strategy running
  ANALYZING = 'ANALYZING',                 // Strategy analyzing market
  SIGNAL_DETECTED = 'SIGNAL_DETECTED',     // Signal detected, preparing to enter
  ENTERING_POSITION = 'ENTERING_POSITION', // Placing entry order
  POSITION_OPEN = 'POSITION_OPEN',         // Position is open, paused analyzing
  CLOSING = 'CLOSING',                     // Position closing (SL/TP hit)
}

export interface StrategyState {
  version: number;                         // Schema version for migrations
  strategyName: string | null;
  instrument: string | null;
  state: StrategyLifecycleState;
  startedAt: number | null;
  lastTransition: number;
  positionEntryPrice: number | null;
  positionSize: number | null;
  positionSide: 'long' | 'short' | null;
  metadata: Record<string, any>;
}

export class SingleStrategyViolationError extends Error {
  constructor(activeStrategy: string, attemptedStrategy: string) {
    super(
      `Cannot start strategy "${attemptedStrategy}": strategy "${activeStrategy}" is already active. ` +
      `Only one strategy can run at a time.`
    );
    this.name = 'SingleStrategyViolationError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(from: StrategyLifecycleState, to: StrategyLifecycleState) {
    super(`Invalid state transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class StrategyManager extends EventEmitter {
  private static instance: StrategyManager | null = null;
  private state: StrategyState;
  private stateFilePath: string;
  private backupInterval: NodeJS.Timeout | null = null;
  private readonly STATE_FILE_DIR = path.join(process.cwd(), 'data');
  private readonly STATE_FILE_NAME = 'strategy-state.json';
  private readonly BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
  private readonly BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_BACKUPS = 24; // Keep last 24 backups (1 day with hourly backups)
  private readonly CURRENT_SCHEMA_VERSION = 1;

  private constructor() {
    super();
    this.stateFilePath = path.join(this.STATE_FILE_DIR, this.STATE_FILE_NAME);
    this.state = this.getInitialState();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): StrategyManager {
    if (!StrategyManager.instance) {
      StrategyManager.instance = new StrategyManager();
    }
    return StrategyManager.instance;
  }

  /**
   * Initialize manager (load state from disk)
   */
  public async initialize(): Promise<void> {
    await this.ensureStateDirectory();
    await this.ensureBackupDirectory();
    await this.loadState();
    this.startBackupSchedule();
    console.log('[StrategyManager] Initialized', {
      state: this.state.state,
      strategy: this.state.strategyName,
      version: this.state.version,
    });
  }

  /**
   * Cleanup (stop backup schedule)
   */
  public async cleanup(): Promise<void> {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
    await this.saveState();
    console.log('[StrategyManager] Cleaned up');
  }

  /**
   * Get current state
   */
  public getState(): StrategyState {
    return { ...this.state };
  }

  /**
   * Get current lifecycle state
   */
  public getCurrentState(): StrategyLifecycleState {
    return this.state.state;
  }

  /**
   * Check if a strategy is currently active
   */
  public isStrategyActive(): boolean {
    return this.state.state !== StrategyLifecycleState.IDLE;
  }

  /**
   * Get active strategy name (null if none active)
   */
  public getActiveStrategy(): string | null {
    return this.state.strategyName;
  }

  /**
   * Start a strategy (GUARD-002: Single Strategy Enforcement)
   * 
   * @throws SingleStrategyViolationError if another strategy is active
   */
  public async startStrategy(strategyName: string, instrument: string): Promise<void> {
    // GUARD-002: Check if another strategy is active
    if (this.isStrategyActive()) {
      throw new SingleStrategyViolationError(
        this.state.strategyName!,
        strategyName
      );
    }

    // Transition to ANALYZING
    await this.transitionTo(StrategyLifecycleState.ANALYZING, {
      strategyName,
      instrument,
      startedAt: Date.now(),
    });

    console.log(`[StrategyManager] ✅ Strategy started: ${strategyName} on ${instrument}`);
  }

  /**
   * Stop the active strategy
   */
  public async stopStrategy(): Promise<void> {
    if (!this.isStrategyActive()) {
      console.warn('[StrategyManager] No active strategy to stop');
      return;
    }

    const strategyName = this.state.strategyName;

    // Transition to IDLE
    await this.transitionTo(StrategyLifecycleState.IDLE, {
      strategyName: null,
      instrument: null,
      startedAt: null,
      positionEntryPrice: null,
      positionSize: null,
      positionSide: null,
    });

    console.log(`[StrategyManager] ⏹️  Strategy stopped: ${strategyName}`);
  }

  /**
   * Signal detected - preparing to enter position
   */
  public async onSignalDetected(metadata: Record<string, any> = {}): Promise<void> {
    this.validateTransition(StrategyLifecycleState.ANALYZING, StrategyLifecycleState.SIGNAL_DETECTED);
    
    await this.transitionTo(StrategyLifecycleState.SIGNAL_DETECTED, {
      metadata: { ...this.state.metadata, ...metadata },
    });

    console.log('[StrategyManager] 📊 Signal detected');
  }

  /**
   * Entering position - placing orders
   */
  public async onEnteringPosition(): Promise<void> {
    this.validateTransition(StrategyLifecycleState.SIGNAL_DETECTED, StrategyLifecycleState.ENTERING_POSITION);
    
    await this.transitionTo(StrategyLifecycleState.ENTERING_POSITION);

    console.log('[StrategyManager] 📤 Entering position...');
  }

  /**
   * Position opened - pause analyzing
   */
  public async onPositionOpened(
    entryPrice: number,
    size: number,
    side: 'long' | 'short'
  ): Promise<void> {
    this.validateTransition(StrategyLifecycleState.ENTERING_POSITION, StrategyLifecycleState.POSITION_OPEN);
    
    await this.transitionTo(StrategyLifecycleState.POSITION_OPEN, {
      positionEntryPrice: entryPrice,
      positionSize: size,
      positionSide: side,
    });

    console.log('[StrategyManager] ✅ Position opened - analyzing PAUSED', {
      entry: entryPrice,
      size,
      side,
    });
  }

  /**
   * Position closing - SL or TP hit
   */
  public async onPositionClosing(): Promise<void> {
    this.validateTransition(StrategyLifecycleState.POSITION_OPEN, StrategyLifecycleState.CLOSING);
    
    await this.transitionTo(StrategyLifecycleState.CLOSING);

    console.log('[StrategyManager] 📥 Position closing...');
  }

  /**
   * Position closed - resume analyzing
   */
  public async onPositionClosed(): Promise<void> {
    this.validateTransition(StrategyLifecycleState.CLOSING, StrategyLifecycleState.ANALYZING);
    
    await this.transitionTo(StrategyLifecycleState.ANALYZING, {
      positionEntryPrice: null,
      positionSize: null,
      positionSide: null,
    });

    console.log('[StrategyManager] ✅ Position closed - analyzing RESUMED');
  }

  /**
   * Should strategy analyze market?
   * Returns false when position is open (paused)
   */
  public shouldAnalyze(): boolean {
    return this.state.state === StrategyLifecycleState.ANALYZING;
  }

  /**
   * Can open a new position?
   * Returns false if already in position or entering
   */
  public canOpenPosition(): boolean {
    return (
      this.state.state === StrategyLifecycleState.ANALYZING ||
      this.state.state === StrategyLifecycleState.SIGNAL_DETECTED
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getInitialState(): StrategyState {
    return {
      version: this.CURRENT_SCHEMA_VERSION,
      strategyName: null,
      instrument: null,
      state: StrategyLifecycleState.IDLE,
      startedAt: null,
      lastTransition: Date.now(),
      positionEntryPrice: null,
      positionSize: null,
      positionSide: null,
      metadata: {},
    };
  }

  private async transitionTo(
    newState: StrategyLifecycleState,
    updates: Partial<StrategyState> = {}
  ): Promise<void> {
    const oldState = this.state.state;

    // Update state
    this.state = {
      ...this.state,
      ...updates,
      state: newState,
      lastTransition: Date.now(),
    };

    // Emit event
    this.emit('stateChange', {
      from: oldState,
      to: newState,
      state: this.getState(),
    });

    // Persist to disk
    await this.saveState();
  }

  private validateTransition(from: StrategyLifecycleState, to: StrategyLifecycleState): void {
    if (this.state.state !== from) {
      throw new InvalidStateTransitionError(this.state.state, to);
    }
  }

  private async ensureStateDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.STATE_FILE_DIR, { recursive: true });
    } catch (error) {
      console.error('[StrategyManager] Failed to create state directory:', error);
      throw error;
    }
  }

  private async saveState(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.stateFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      const tempFile = `${this.stateFilePath}.tmp`;
      
      // Write to temp file first (atomic write)
      await fs.writeFile(tempFile, JSON.stringify(this.state, null, 2), 'utf-8');
      
      // Rename to final file (atomic operation)
      await fs.rename(tempFile, this.stateFilePath);
      
      console.log('[StrategyManager] State saved:', this.state.state);
    } catch (error) {
      console.error('[StrategyManager] Failed to save state:', error);
      // Don't throw - continue operation even if save fails
    }
  }

  private async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      let loadedState = JSON.parse(data);
      
      // Migrate if needed
      loadedState = this.migrateState(loadedState);
      
      // Validate loaded state
      if (this.isValidState(loadedState)) {
        this.state = loadedState;
        console.log('[StrategyManager] State loaded from disk:', {
          state: this.state.state,
          strategy: this.state.strategyName,
          version: this.state.version,
        });
      } else {
        console.warn('[StrategyManager] Invalid state file, using default');
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('[StrategyManager] No existing state file, starting fresh');
      } else {
        console.error('[StrategyManager] Failed to load state:', error);
      }
      // Use default state
    }
  }

  private isValidState(state: any): state is StrategyState {
    return (
      state &&
      typeof state === 'object' &&
      typeof state.state === 'string' &&
      Object.values(StrategyLifecycleState).includes(state.state as StrategyLifecycleState)
    );
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.BACKUP_DIR, { recursive: true });
    } catch (error) {
      console.error('[StrategyManager] Failed to create backup directory:', error);
    }
  }

  /**
   * Start backup schedule (hourly)
   */
  private startBackupSchedule(): void {
    // Create initial backup
    this.createBackup().catch(err => 
      console.error('[StrategyManager] Initial backup failed:', err)
    );

    // Schedule hourly backups
    this.backupInterval = setInterval(() => {
      this.createBackup().catch(err => 
        console.error('[StrategyManager] Scheduled backup failed:', err)
      );
    }, this.BACKUP_INTERVAL_MS);

    console.log('[StrategyManager] Backup schedule started (hourly)');
  }

  /**
   * Create a backup of current state
   */
  private async createBackup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const backupPath = path.join(this.BACKUP_DIR, `strategy-state-${timestamp}.json`);
      
      await fs.writeFile(backupPath, JSON.stringify(this.state, null, 2), 'utf-8');
      
      console.log('[StrategyManager] Backup created:', backupPath);
      
      // Cleanup old backups
      await this.cleanupOldBackups();
    } catch (error) {
      console.error('[StrategyManager] Backup creation failed:', error);
    }
  }

  /**
   * Cleanup old backups (keep last MAX_BACKUPS)
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.BACKUP_DIR);
      const backupFiles = files
        .filter(f => f.startsWith('strategy-state-') && f.endsWith('.json'))
        .sort()
        .reverse(); // Newest first

      // Delete old backups
      const filesToDelete = backupFiles.slice(this.MAX_BACKUPS);
      for (const file of filesToDelete) {
        await fs.unlink(path.join(this.BACKUP_DIR, file));
        console.log('[StrategyManager] Deleted old backup:', file);
      }
    } catch (error) {
      console.error('[StrategyManager] Backup cleanup failed:', error);
    }
  }

  /**
   * Migrate state from older schema versions
   */
  private migrateState(state: any): StrategyState {
    // If no version, assume v0 (legacy)
    const version = state.version || 0;

    if (version < this.CURRENT_SCHEMA_VERSION) {
      console.log(`[StrategyManager] Migrating state from v${version} to v${this.CURRENT_SCHEMA_VERSION}`);
      
      // Add migration logic here as schema evolves
      // Example: v0 → v1 (add version field)
      if (version === 0) {
        state.version = 1;
      }
    }

    return state;
  }

  /**
   * Reset to initial state (for testing)
   */
  public async reset(): Promise<void> {
    this.state = this.getInitialState();
    await this.saveState();
    console.log('[StrategyManager] State reset to IDLE');
  }
}
