/**
 * UserStrategyRepository
 * 
 * PostgreSQL repository for managing per-user strategy state
 * Replaces state-manager.ts JSON file approach for multi-user support
 * 
 * Database: PostgreSQL user_strategies table
 * Design: Agnostic (ANY strategy, ANY broker, ANY environment)
 */

import { Pool } from 'pg';
import type { DeribitEnvironment } from '../deribit-client';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tradebaas:tradebaas_secure_2025@localhost:5432/tradebaas',
});

export interface UserStrategy {
  id: string;
  userId: string;
  strategyName: string;
  instrument: string;
  broker: string;
  environment: DeribitEnvironment;
  config: Record<string, any>; // JSONB - agnostic for ANY strategy config
  status: 'active' | 'stopped' | 'paused' | 'error';
  lastAction?: string; // manual_start, manual_stop, auto_resume, etc.
  autoReconnect: boolean; // false = manual disconnect, no auto-resume
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastHeartbeat?: Date;
  errorMessage?: string;
  errorCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserStrategyParams {
  userId: string;
  strategyName: string;
  instrument: string;
  broker?: string; // default: 'deribit'
  environment: DeribitEnvironment;
  config: Record<string, any>;
  status?: 'active' | 'stopped'; // default: 'stopped'
  lastAction?: string;
  autoReconnect?: boolean; // default: true
}

export interface UpdateUserStrategyParams {
  status?: 'active' | 'stopped' | 'paused' | 'error';
  lastAction?: string;
  autoReconnect?: boolean;
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastHeartbeat?: Date;
  errorMessage?: string;
  errorCount?: number;
  config?: Record<string, any>;
}

class UserStrategyRepository {
  /**
   * Find all strategies for a specific user
   */
  async findByUser(userId: string, broker: string = 'deribit', environment?: DeribitEnvironment): Promise<UserStrategy[]> {
    let query = `
      SELECT 
        id, user_id as "userId", strategy_name as "strategyName", instrument, 
        broker, environment, config, status, last_action as "lastAction",
        auto_reconnect as "autoReconnect", connected_at as "connectedAt",
        disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
        error_message as "errorMessage", error_count as "errorCount",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM user_strategies
      WHERE user_id = $1 AND broker = $2
    `;
    
    const params: any[] = [userId, broker];
    
    if (environment) {
      query += ` AND environment = $3`;
      params.push(environment);
    }
    
    query += ` ORDER BY updated_at DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Find a specific strategy for a user
   */
  async findByUserAndStrategy(
    userId: string, 
    strategyName: string, 
    instrument: string,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<UserStrategy | null> {
    const result = await pool.query(`
      SELECT 
        id, user_id as "userId", strategy_name as "strategyName", instrument, 
        broker, environment, config, status, last_action as "lastAction",
        auto_reconnect as "autoReconnect", connected_at as "connectedAt",
        disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
        error_message as "errorMessage", error_count as "errorCount",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM user_strategies
      WHERE user_id = $1 
        AND strategy_name = $2 
        AND instrument = $3
        AND broker = $4
        AND environment = $5
      LIMIT 1
    `, [userId, strategyName, instrument, broker, environment]);
    
    return result.rows[0] || null;
  }

  /**
   * Find all strategies that should auto-resume for a user
   * (status=active AND autoReconnect=true)
   */
  async findStrategiesToResume(
    userId: string,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<UserStrategy[]> {
    const result = await pool.query(`
      SELECT 
        id, user_id as "userId", strategy_name as "strategyName", instrument, 
        broker, environment, config, status, last_action as "lastAction",
        auto_reconnect as "autoReconnect", connected_at as "connectedAt",
        disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
        error_message as "errorMessage", error_count as "errorCount",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM user_strategies
      WHERE user_id = $1 
        AND broker = $2
        AND environment = $3
        AND status = 'active'
        AND auto_reconnect = true
      ORDER BY connected_at ASC
    `, [userId, broker, environment]);
    
    return result.rows;
  }

  /**
   * Find ALL strategies across ALL users that should auto-resume
   * (status=active AND autoReconnect=true)
   * Used during server initialization for global auto-resume
   */
  async findAllStrategiesToResume(
    broker: string = 'deribit',
    environment?: DeribitEnvironment
  ): Promise<UserStrategy[]> {
    let query = `
      SELECT 
        id, user_id as "userId", strategy_name as "strategyName", instrument, 
        broker, environment, config, status, last_action as "lastAction",
        auto_reconnect as "autoReconnect", connected_at as "connectedAt",
        disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
        error_message as "errorMessage", error_count as "errorCount",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM user_strategies
      WHERE broker = $1
        AND status = 'active'
        AND auto_reconnect = true
    `;
    
    const params: any[] = [broker];
    
    if (environment) {
      query += ` AND environment = $2`;
      params.push(environment);
    }
    
    query += ` ORDER BY user_id ASC, connected_at ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Create or update a strategy
   */
  async save(params: CreateUserStrategyParams): Promise<UserStrategy> {
    const {
      userId,
      strategyName,
      instrument,
      broker = 'deribit',
      environment,
      config,
      status = 'stopped',
      lastAction,
      autoReconnect = true,
    } = params;

    // Check if strategy already exists
    const existing = await this.findByUserAndStrategy(userId, strategyName, instrument, broker, environment);
    
    if (existing) {
      // Update existing strategy
      const result = await pool.query(`
        UPDATE user_strategies
        SET 
          config = $1,
          status = $2,
          last_action = $3,
          auto_reconnect = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING 
          id, user_id as "userId", strategy_name as "strategyName", instrument, 
          broker, environment, config, status, last_action as "lastAction",
          auto_reconnect as "autoReconnect", connected_at as "connectedAt",
          disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
          error_message as "errorMessage", error_count as "errorCount",
          created_at as "createdAt", updated_at as "updatedAt"
      `, [config, status, lastAction, autoReconnect, existing.id]);
      
      return result.rows[0];
    } else {
      // Insert new strategy
      const result = await pool.query(`
        INSERT INTO user_strategies (
          user_id, strategy_name, instrument, broker, environment, 
          config, status, last_action, auto_reconnect
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING 
          id, user_id as "userId", strategy_name as "strategyName", instrument, 
          broker, environment, config, status, last_action as "lastAction",
          auto_reconnect as "autoReconnect", connected_at as "connectedAt",
          disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
          error_message as "errorMessage", error_count as "errorCount",
          created_at as "createdAt", updated_at as "updatedAt"
      `, [userId, strategyName, instrument, broker, environment, config, status, lastAction, autoReconnect]);
      
      return result.rows[0];
    }
  }

  /**
   * Update strategy status and related fields
   */
  async updateStatus(
    userId: string,
    strategyName: string,
    instrument: string,
    params: UpdateUserStrategyParams,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<UserStrategy | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic UPDATE query based on provided params
    if (params.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.lastAction !== undefined) {
      updates.push(`last_action = $${paramIndex++}`);
      values.push(params.lastAction);
    }
    if (params.autoReconnect !== undefined) {
      updates.push(`auto_reconnect = $${paramIndex++}`);
      values.push(params.autoReconnect);
    }
    if (params.connectedAt !== undefined) {
      updates.push(`connected_at = $${paramIndex++}`);
      values.push(params.connectedAt);
    }
    if (params.disconnectedAt !== undefined) {
      updates.push(`disconnected_at = $${paramIndex++}`);
      values.push(params.disconnectedAt);
    }
    if (params.lastHeartbeat !== undefined) {
      updates.push(`last_heartbeat = $${paramIndex++}`);
      values.push(params.lastHeartbeat);
    }
    if (params.errorMessage !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(params.errorMessage);
    }
    if (params.errorCount !== undefined) {
      updates.push(`error_count = $${paramIndex++}`);
      values.push(params.errorCount);
    }
    if (params.config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(params.config);
    }

    if (updates.length === 0) {
      // No updates provided
      return this.findByUserAndStrategy(userId, strategyName, instrument, broker, environment);
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    // Add WHERE clause parameters
    values.push(userId, strategyName, instrument, broker, environment);

    const query = `
      UPDATE user_strategies
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex++}
        AND strategy_name = $${paramIndex++}
        AND instrument = $${paramIndex++}
        AND broker = $${paramIndex++}
        AND environment = $${paramIndex++}
      RETURNING 
        id, user_id as "userId", strategy_name as "strategyName", instrument, 
        broker, environment, config, status, last_action as "lastAction",
        auto_reconnect as "autoReconnect", connected_at as "connectedAt",
        disconnected_at as "disconnectedAt", last_heartbeat as "lastHeartbeat",
        error_message as "errorMessage", error_count as "errorCount",
        created_at as "createdAt", updated_at as "updatedAt"
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Update heartbeat timestamp (called periodically while strategy is running)
   */
  async updateHeartbeat(
    userId: string,
    strategyName: string,
    instrument: string,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<void> {
    await pool.query(`
      UPDATE user_strategies
      SET last_heartbeat = NOW()
      WHERE user_id = $1 
        AND strategy_name = $2 
        AND instrument = $3
        AND broker = $4
        AND environment = $5
    `, [userId, strategyName, instrument, broker, environment]);
  }

  /**
   * Mark strategy as disconnected (manual or error)
   */
  async markDisconnected(
    userId: string,
    strategyName: string,
    instrument: string,
    manualDisconnect: boolean = false,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<void> {
    await pool.query(`
      UPDATE user_strategies
      SET 
        status = 'stopped',
        disconnected_at = NOW(),
        auto_reconnect = $1,
        last_action = $2,
        updated_at = NOW()
      WHERE user_id = $3 
        AND strategy_name = $4 
        AND instrument = $5
        AND broker = $6
        AND environment = $7
    `, [
      !manualDisconnect, // If manual disconnect, set autoReconnect = false
      manualDisconnect ? 'manual_stop' : 'auto_stop',
      userId,
      strategyName,
      instrument,
      broker,
      environment,
    ]);
  }

  /**
   * Delete a strategy
   */
  async delete(
    userId: string,
    strategyName: string,
    instrument: string,
    broker: string = 'deribit',
    environment: DeribitEnvironment = 'testnet'
  ): Promise<boolean> {
    const result = await pool.query(`
      DELETE FROM user_strategies
      WHERE user_id = $1 
        AND strategy_name = $2 
        AND instrument = $3
        AND broker = $4
        AND environment = $5
    `, [userId, strategyName, instrument, broker, environment]);
    
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Delete all strategies for a user
   */
  async deleteAllForUser(
    userId: string,
    broker?: string,
    environment?: DeribitEnvironment
  ): Promise<number> {
    let query = 'DELETE FROM user_strategies WHERE user_id = $1';
    const params: any[] = [userId];
    
    if (broker) {
      query += ` AND broker = $2`;
      params.push(broker);
    }
    
    if (environment) {
      query += ` AND environment = $${params.length + 1}`;
      params.push(environment);
    }
    
    const result = await pool.query(query, params);
    return result.rowCount || 0;
  }
}

export const userStrategyRepository = new UserStrategyRepository();
