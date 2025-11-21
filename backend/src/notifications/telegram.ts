/**
 * Telegram Notification Service (NOTIF-001)
 * 
 * Provides Telegram bot integration for alerts:
 * - Trade open/close notifications
 * - Strategy start/stop alerts
 * - Error notifications
 * - Alert throttling to prevent spam
 */

import TelegramBot from 'node-telegram-bot-api';
import { log } from '../logger';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface TradeNotification {
  type: 'trade_open' | 'trade_close';
  instrument: string;
  side: 'long' | 'short';
  entryPrice?: number;
  exitPrice?: number;
  size: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface StrategyNotification {
  type: 'strategy_start' | 'strategy_stop';
  strategyName: string;
  instrument: string;
}

export interface ErrorNotification {
  type: 'error';
  message: string;
  context?: Record<string, any>;
}

type Notification = TradeNotification | StrategyNotification | ErrorNotification;

/**
 * Telegram Notification Service
 * Manages sending alerts to Telegram with throttling
 */
export class TelegramService {
  private static instance: TelegramService;
  private bot: TelegramBot | null = null;
  private config: TelegramConfig;
  private throttleMap: Map<string, number> = new Map();
  private readonly THROTTLE_WINDOW_MS = 60000; // 1 minute

  private constructor(config: TelegramConfig) {
    this.config = config;
    
    if (config.enabled && config.botToken && config.chatId) {
      try {
        this.bot = new TelegramBot(config.botToken, { polling: false });
        log.info('Telegram service initialized', {
          service: 'TelegramService',
          chatId: config.chatId,
        });
      } catch (error) {
        log.error('Failed to initialize Telegram bot', {
          service: 'TelegramService',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      log.warn('Telegram service disabled or not configured', {
        service: 'TelegramService',
        enabled: config.enabled,
        hasToken: !!config.botToken,
        hasChatId: !!config.chatId,
      });
    }
  }

  public static getInstance(config?: TelegramConfig): TelegramService {
    if (!TelegramService.instance) {
      if (!config) {
        // Load from environment
        config = {
          botToken: process.env.TELEGRAM_BOT_TOKEN || '',
          chatId: process.env.TELEGRAM_CHAT_ID || '',
          enabled: process.env.TELEGRAM_ENABLED === 'true',
        };
      }
      TelegramService.instance = new TelegramService(config);
    }
    return TelegramService.instance;
  }

  /**
   * Get current configuration (token masked)
   */
  public getConfig(): { enabled: boolean; chatId: string; tokenPresent: boolean } {
    return {
      enabled: this.config.enabled,
      chatId: this.config.chatId || '',
      tokenPresent: !!this.config.botToken,
    };
  }

  /**
   * Update configuration at runtime and (re)initialize bot
   */
  public updateConfig(config: Partial<TelegramConfig>): void {
    // Merge new values
    this.config = {
      ...this.config,
      ...config,
    };

    // Recreate bot instance if enabled and creds provided
    try {
      if (this.bot) {
        // node-telegram-bot-api has no explicit close for non-polling bot
        this.bot = null;
      }

      if (this.config.enabled && this.config.botToken && this.config.chatId) {
        this.bot = new TelegramBot(this.config.botToken, { polling: false });
        log.info('Telegram service reconfigured', {
          service: 'TelegramService',
          chatId: this.config.chatId,
        });
      } else {
        log.warn('Telegram service disabled or incomplete config after update', {
          service: 'TelegramService',
          enabled: this.config.enabled,
          hasToken: !!this.config.botToken,
          hasChatId: !!this.config.chatId,
        });
      }
    } catch (error) {
      log.error('Failed to (re)initialize Telegram bot on update', {
        service: 'TelegramService',
        error: error instanceof Error ? error.message : String(error),
      });
      this.bot = null;
    }
  }

  /**
   * Check if a notification type is throttled
   */
  private isThrottled(notificationType: string): boolean {
    const lastSent = this.throttleMap.get(notificationType);
    if (!lastSent) {
      return false;
    }
    
    const timeSinceLastSent = Date.now() - lastSent;
    return timeSinceLastSent < this.THROTTLE_WINDOW_MS;
  }

  /**
   * Mark notification type as sent (for throttling)
   */
  private markAsSent(notificationType: string): void {
    this.throttleMap.set(notificationType, Date.now());
    
    // Clean up old entries
    setTimeout(() => {
      this.throttleMap.delete(notificationType);
    }, this.THROTTLE_WINDOW_MS);
  }

  /**
   * Format notification message with emojis
   */
  private formatMessage(notification: Notification): string {
    switch (notification.type) {
      case 'trade_open': {
        const emoji = notification.side === 'long' ? '🟢' : '🔴';
        return [
          `${emoji} <b>Trade Opened</b>`,
          '',
          `Instrument: ${notification.instrument}`,
          `Side: ${notification.side.toUpperCase()}`,
          `Entry Price: $${notification.entryPrice?.toFixed(2)}`,
          `Size: ${notification.size}`,
        ].join('\n');
      }
      
      case 'trade_close': {
        const pnlEmoji = (notification.pnl && notification.pnl > 0) ? '✅' : '❌';
        return [
          `${pnlEmoji} <b>Trade Closed</b>`,
          '',
          `Instrument: ${notification.instrument}`,
          `Exit Price: $${notification.exitPrice?.toFixed(2)}`,
          `PnL: $${notification.pnl?.toFixed(2)} (${notification.pnlPercent?.toFixed(2)}%)`,
        ].join('\n');
      }
      
      case 'strategy_start': {
        return [
          '🚀 <b>Strategy Started</b>',
          '',
          `Strategy: ${notification.strategyName}`,
          `Instrument: ${notification.instrument}`,
        ].join('\n');
      }
      
      case 'strategy_stop': {
        return [
          '🛑 <b>Strategy Stopped</b>',
          '',
          `Strategy: ${notification.strategyName}`,
          `Instrument: ${notification.instrument}`,
        ].join('\n');
      }
      
      case 'error': {
        const context = notification.context 
          ? `\n\nContext: ${JSON.stringify(notification.context, null, 2)}`
          : '';
        return [
          '⚠️ <b>Error Alert</b>',
          '',
          `${notification.message}${context}`,
        ].join('\n');
      }
      
      default:
        return 'Unknown notification type';
    }
  }

  /**
   * Send notification to Telegram
   */
  public async sendNotification(notification: Notification): Promise<boolean> {
    if (!this.bot || !this.config.enabled) {
      log.debug('Telegram notification skipped (service disabled)', {
        service: 'TelegramService',
        notificationType: notification.type,
      });
      return false;
    }

    // Check throttling
    if (this.isThrottled(notification.type)) {
      log.debug('Telegram notification throttled', {
        service: 'TelegramService',
        notificationType: notification.type,
      });
      return false;
    }

    try {
      const message = this.formatMessage(notification);
      await this.bot.sendMessage(this.config.chatId, message, {
        parse_mode: 'HTML',
      });
      
      this.markAsSent(notification.type);
      
      log.info('Telegram notification sent', {
        service: 'TelegramService',
        notificationType: notification.type,
      });
      
      return true;
    } catch (error) {
      log.error('Failed to send Telegram notification', {
        service: 'TelegramService',
        notificationType: notification.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Convenience methods for specific notification types
   */

  public async notifyTradeOpen(params: Omit<TradeNotification, 'type'>): Promise<boolean> {
    return this.sendNotification({ type: 'trade_open', ...params });
  }

  public async notifyTradeClose(params: Omit<TradeNotification, 'type'>): Promise<boolean> {
    return this.sendNotification({ type: 'trade_close', ...params });
  }

  public async notifyStrategyStart(params: Omit<StrategyNotification, 'type'>): Promise<boolean> {
    return this.sendNotification({ type: 'strategy_start', ...params });
  }

  public async notifyStrategyStop(params: Omit<StrategyNotification, 'type'>): Promise<boolean> {
    return this.sendNotification({ type: 'strategy_stop', ...params });
  }

  public async notifyError(message: string, context?: Record<string, any>): Promise<boolean> {
    return this.sendNotification({ type: 'error', message, context });
  }
}

// Export singleton instance
export const telegramService = TelegramService.getInstance();
