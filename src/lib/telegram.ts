export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface TradeNotification {
  type: 'TRADE_OPENED' | 'TRADE_CLOSED';
  instrument: string;
  side: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  amount: number;
  strategy: string;
  reason?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface ErrorNotification {
  strategy: string;
  errorType: string;
  message: string;
  action: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export class TelegramNotifier {
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  private async sendMessage(message: string): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false;
    }

    try {
      const { proxyClient } = await import('./proxy-client');
      const response = await proxyClient.sendTelegramMessage(
        this.config.botToken,
        this.config.chatId,
        message,
        'HTML'
      );
      return response.success;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  async sendTradeOpened(notification: TradeNotification): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false;
    }

    const emoji = notification.side === 'buy' ? '📈' : '📉';
    const direction = notification.side === 'buy' ? 'LONG' : 'SHORT';
    
    const message = `
${emoji} <b>NIEUWE TRADE GEOPEND</b>

<b>Strategie:</b> ${notification.strategy}
<b>Instrument:</b> ${notification.instrument}
<b>Richting:</b> ${direction}

<b>📊 Trade Details:</b>
• Entry: $${notification.entry.toFixed(2)}
• Stop Loss: $${notification.stopLoss.toFixed(2)}
• Take Profit: $${notification.takeProfit.toFixed(2)}
• Hoeveelheid: ${notification.amount.toFixed(4)}

${notification.reason ? `<b>💡 Reden:</b>\n${notification.reason}` : ''}

<i>Veel succes! 🎯</i>
`.trim();

    return this.sendMessage(message);
  }

  async sendTradeClosed(notification: TradeNotification): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false;
    }

    const isWin = (notification.pnl || 0) > 0;
    const emoji = isWin ? '✅' : '❌';
    const result = isWin ? 'WINST' : 'VERLIES';
    const direction = notification.side === 'buy' ? 'LONG' : 'SHORT';
    
    const message = `
${emoji} <b>TRADE GESLOTEN - ${result}</b>

<b>Strategie:</b> ${notification.strategy}
<b>Instrument:</b> ${notification.instrument}
<b>Richting:</b> ${direction}

<b>📊 Entry & Exit:</b>
• Entry: $${notification.entry.toFixed(2)}
• Exit: $${notification.exitPrice?.toFixed(2) || 'N/A'}
${notification.stopLoss ? `• Stop Loss: $${notification.stopLoss.toFixed(2)}` : ''}
${notification.takeProfit ? `• Take Profit: $${notification.takeProfit.toFixed(2)}` : ''}

<b>💰 Resultaat:</b>
• PnL: ${isWin ? '+' : ''}$${(notification.pnl || 0).toFixed(2)}
• PnL %: ${isWin ? '+' : ''}${(notification.pnlPercent || 0).toFixed(2)}%

<b>📝 Sluitingsreden:</b>
${notification.reason || 'Trade gesloten'}

${isWin ? '🎉 Goed gedaan!' : '💪 Volgende keer beter!'}
`.trim();

    return this.sendMessage(message);
  }

  async sendError(notification: ErrorNotification): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false;
    }

    const timestamp = new Date(notification.timestamp).toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const contextStr = notification.context 
      ? Object.entries(notification.context)
          .filter(([key]) => !['stack', 'apiResponse'].includes(key))
          .map(([key, value]) => `  • ${key}: ${JSON.stringify(value)}`)
          .join('\n')
      : '';
    
    const message = `
⚠️ <b>STRATEGIE ERROR</b>

<b>Strategie:</b> ${notification.strategy}
<b>Actie:</b> ${notification.action}
<b>Tijd:</b> ${timestamp}

<b>🔴 Error Type:</b> ${notification.errorType}

<b>📄 Melding:</b>
${notification.message}

${contextStr ? `<b>📋 Context:</b>\n${contextStr}` : ''}

<i>⚠️ Strategie automatisch gestopt voor veiligheid</i>
`.trim();

    return this.sendMessage(message);
  }

  async testConnection(): Promise<{ 
    success: boolean; 
    message: string;
    details?: Record<string, unknown>;
    rawResponse?: unknown;
  }> {
    if (!this.config.botToken || !this.config.chatId) {
      return {
        success: false,
        message: 'Bot token en chat ID zijn verplicht',
        details: {
          'Bot token aanwezig': !!this.config.botToken,
          'Chat ID aanwezig': !!this.config.chatId,
        },
      };
    }

    try {
      const { proxyClient } = await import('./proxy-client');
      
      const startTime = Date.now();
      const result = await proxyClient.testTelegramConnection(
        this.config.botToken,
        this.config.chatId
      );
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: result.success,
        message: result.message,
        details: {
          'Response tijd': `${responseTime}ms`,
          'Bot info': result.botInfo,
        },
        rawResponse: result,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Telegram API niet bereikbaar: ${error.message || 'Netwerkfout'}`,
        details: {
          'Error type': error.name,
          'Error message': error.message,
        },
        rawResponse: error,
      };
    }
  }
}

export function createTelegramNotifier(config: TelegramConfig): TelegramNotifier {
  return new TelegramNotifier(config);
}
