import type { DeribitClient } from '@/lib/deribitClient';

export interface CircuitBreakerConfig {
  maxDailyLossPercent?: number;
  maxDailyLossFixed?: number;
  maxDailyTrades?: number;
  enabled: boolean;
}

interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private client: DeribitClient;
  private logger: Logger;
  private dailyTradeCount: number = 0;
  private dailyPnL: number = 0;
  private startingEquity: number = 0;
  private lastResetDate: string = '';
  private isTripped: boolean = false;

  constructor(client: DeribitClient, config: CircuitBreakerConfig, logger: Logger) {
    this.client = client;
    this.config = config;
    this.logger = logger;
  }

  async initialize(currentEquity: number): Promise<void> {
    this.startingEquity = currentEquity;
    this.resetDailyCountersIfNeeded();
  }

  recordTrade(pnl: number): void {
    this.dailyTradeCount++;
    this.dailyPnL += pnl;
    this.logger.info('[CircuitBreaker] Trade recorded', {
      count: this.dailyTradeCount,
      dailyPnL: this.dailyPnL,
    });
    this.checkBreakers();
  }

  checkBreakers(): boolean {
    if (!this.config.enabled) return false;

    if (this.config.maxDailyTrades && this.dailyTradeCount >= this.config.maxDailyTrades) {
      this.trip('Max daily trades reached');
      return true;
    }

    if (this.config.maxDailyLossFixed && this.dailyPnL <= -this.config.maxDailyLossFixed) {
      this.trip('Max daily loss (fixed) reached');
      return true;
    }

    if (this.config.maxDailyLossPercent && this.startingEquity > 0) {
      const lossPercent = (this.dailyPnL / this.startingEquity) * 100;
      if (lossPercent <= -this.config.maxDailyLossPercent) {
        this.trip('Max daily loss (percent) reached');
        return true;
      }
    }

    return false;
  }

  isCircuitTripped(): boolean {
    return this.isTripped;
  }

  reset(): void {
    this.isTripped = false;
    this.logger.info('[CircuitBreaker] Reset');
  }

  private trip(reason: string): void {
    this.isTripped = true;
    this.logger.warn('[CircuitBreaker] TRIPPED', { reason });
  }

  private resetDailyCountersIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastResetDate !== today) {
      this.dailyTradeCount = 0;
      this.dailyPnL = 0;
      this.lastResetDate = today;
      this.logger.info('[CircuitBreaker] Daily counters reset');
    }
  }
}

export async function cancelAllOpenOrders(client: DeribitClient, logger: Logger): Promise<void> {
  try {
    logger.info('[CircuitBreaker] Cancelling all open orders');
    await client.request('private/cancel_all', {});
    logger.info('[CircuitBreaker] All orders cancelled');
  } catch (error) {
    logger.error('[CircuitBreaker] Failed to cancel all orders', { error });
    throw error;
  }
}
