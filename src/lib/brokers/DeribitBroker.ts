import {
  IBroker,
  BrokerCredentials,
  BrokerEnvironment,
  ConnectionState,
  BrokerInstrument,
  BrokerBalance,
  BrokerTicker,
  BrokerOrderParams,
  BrokerOrder,
  BrokerPosition,
  BrokerCandle,
} from './IBroker';
import { DeribitClient } from '../deribitClient';

export class DeribitBroker implements IBroker {
  private client: DeribitClient | null = null;
  private environment: BrokerEnvironment = 'live';
  private onStateChangeCallback?: (state: ConnectionState) => void;

  getName(): string {
    return 'Deribit';
  }

  async connect(
    credentials: BrokerCredentials,
    environment: BrokerEnvironment,
    onStateChange?: (state: ConnectionState) => void
  ): Promise<void> {
    this.environment = environment;
    this.onStateChangeCallback = onStateChange;

    this.client = new DeribitClient(environment, onStateChange);
    await this.client.connect(credentials);
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getConnectionState(): ConnectionState {
    const state = this.client?.getConnectionState() || 'Stopped';
    // Map client-specific 'Analyzing' to 'Active' for broker contract
    return state === 'Analyzing' ? 'Active' : state;
  }

  async getInstruments(): Promise<BrokerInstrument[]> {
    if (!this.client) throw new Error('Not connected');
    
  const instruments = await this.client.getInstruments();
    return instruments.map(inst => ({
      symbol: inst.instrument_name,
      displayName: inst.instrument_name,
      tickSize: inst.tick_size,
      minTradeAmount: inst.min_trade_amount,
      maxLeverage: inst.max_leverage,
      contractSize: inst.contract_size,
      settlementCurrency: inst.settlement_currency,
      quoteCurrency: inst.quote_currency,
      baseCurrency: inst.instrument_name.split('-')[0] || '',
    }));
  }

  async getInstrument(symbol: string): Promise<BrokerInstrument | null> {
    if (!this.client) throw new Error('Not connected');
    
    const instrument = await this.client.getInstrument(symbol);
    if (!instrument) return null;

    return {
      symbol: instrument.instrument_name,
      displayName: instrument.instrument_name,
      tickSize: instrument.tick_size,
      minTradeAmount: instrument.min_trade_amount,
      maxLeverage: instrument.max_leverage,
      contractSize: instrument.contract_size,
      settlementCurrency: instrument.settlement_currency,
      quoteCurrency: instrument.quote_currency,
      baseCurrency: instrument.instrument_name.split('-')[0] || '',
    };
  }

  async getTicker(symbol: string): Promise<BrokerTicker> {
    if (!this.client) throw new Error('Not connected');
    
    const ticker = await this.client.getTicker(symbol);
    return {
      symbol: ticker.instrument_name,
      lastPrice: ticker.last_price,
      markPrice: ticker.mark_price,
      bidPrice: ticker.best_bid_price,
      askPrice: ticker.best_ask_price,
    };
  }

  async getBalance(currency = 'USDC'): Promise<BrokerBalance> {
    if (!this.client) throw new Error('Not connected');
    
    const summary = await this.client.getAccountSummary(currency);
    return {
      currency: summary.currency,
      total: summary.balance,
      available: summary.available_funds,
      equity: summary.equity,
    };
  }

  async placeOrder(params: BrokerOrderParams): Promise<BrokerOrder> {
    if (!this.client) throw new Error('Not connected');

    const hasTP = !!params.takeProfit;
    const hasSL = !!params.stopLoss;
    
    if (hasTP && hasSL) {
      const instrument = await this.getInstrument(params.symbol);
      if (!instrument) throw new Error('Instrument not found');

      const ocoConfig: Array<{
        type: string;
        price?: number;
        trigger?: string;
        trigger_price?: number;
        reduce_only?: boolean;
      }> = [];
      
      if (params.takeProfit) {
        const tpConfig: {
          type: string;
          price?: number;
          trigger?: string;
          trigger_price?: number;
          reduce_only?: boolean;
        } = {
          type: params.takeProfit.type === 'market' ? 'stop_market' : 'stop_limit',
          trigger_price: params.takeProfit.triggerPrice,
          trigger: 'mark_price',
          reduce_only: true,
        };
        
        if (params.takeProfit.type === 'limit' && params.takeProfit.price !== undefined) {
          tpConfig.price = params.takeProfit.price;
        }
        
        ocoConfig.push(tpConfig);
      }
      
      if (params.stopLoss) {
        const slConfig: {
          type: string;
          price?: number;
          trigger?: string;
          trigger_price?: number;
          reduce_only?: boolean;
        } = {
          type: params.stopLoss.type === 'market' ? 'stop_market' : 'stop_limit',
          trigger_price: params.stopLoss.triggerPrice,
          trigger: 'mark_price',
          reduce_only: true,
        };
        
        if (params.stopLoss.type === 'limit' && params.stopLoss.price !== undefined) {
          slConfig.price = params.stopLoss.price;
        }
        
        ocoConfig.push(slConfig);
      }

      const response = params.side === 'buy'
        ? await this.client.placeBuyOrderWithOTOCO(
            params.symbol,
            params.amount,
            params.label,
            ocoConfig
          )
        : await this.client.placeSellOrderWithOTOCO(
            params.symbol,
            params.amount,
            params.label,
            ocoConfig
          );

      return {
        orderId: response.order_id,
        symbol: response.instrument_name,
        side: params.side,
        type: response.order_state,
        amount: response.amount,
        price: response.price,
        status: response.order_state,
        filled: 0,
        remaining: response.amount,
        timestamp: Date.now(),
      };
    }

    const response = params.side === 'buy'
      ? await this.client.placeBuy(
          params.symbol,
          params.type,
          params.amount,
          params.price,
          params.reduceOnly,
          params.label
        )
      : await this.client.placeSell(
          params.symbol,
          params.type,
          params.amount,
          params.price,
          params.reduceOnly,
          params.label
        );

    return {
      orderId: response.order_id,
      symbol: response.instrument_name,
      side: params.side,
      type: response.order_state,
      amount: response.amount,
      price: response.price,
      status: response.order_state,
      filled: 0,
      remaining: response.amount,
      timestamp: Date.now(),
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.cancelOrder(orderId);
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    if (symbol) {
      await this.client.cancelAllByInstrument(symbol);
    } else {
      await this.client.cancelAll();
    }
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    throw new Error('Not implemented for Deribit');
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    if (!this.client) throw new Error('Not connected');
    const orders = await this.client.getOpenOrders(symbol);
    return orders.map(order => ({
      orderId: order.order_id,
      symbol: order.instrument_name,
      side: order.direction === 'buy' ? 'buy' : 'sell',
  type: order.order_type || 'limit',
      amount: order.amount,
      price: order.price,
      status: order.order_state,
  filled: order.filled_amount || 0,
  remaining: order.amount - (order.filled_amount || 0),
  timestamp: order.creation_timestamp || Date.now(),
    }));
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    if (!this.client) throw new Error('Not connected');
    const positions = await this.client.getPositions(symbol.split('-')[0]);
    const position = positions.find(p => p.instrument_name === symbol);
    
    if (!position || position.size === 0) return null;

    return {
      symbol: position.instrument_name,
      side: position.direction === 'buy' ? 'long' : 'short',
      size: Math.abs(position.size),
      entryPrice: position.average_price,
      markPrice: position.mark_price,
      unrealizedPnl: position.floating_profit_loss,
      leverage: position.leverage || 1,
    };
  }

  async closePosition(symbol: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.closePosition(symbol);
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit = 100
  ): Promise<BrokerCandle[]> {
    if (!this.client) throw new Error('Not connected');
    
    const endTime = Date.now();
    const startTime = endTime - (this.getTimeframeMs(timeframe) * limit);
    
    const candles = await this.client.getTradeHistory(
      symbol,
      startTime,
      endTime,
      limit
    );

    return candles.map(candle => ({
      timestamp: candle.tick,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));
  }

  private getTimeframeMs(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000,
    };
    return map[timeframe] || 60000;
  }

  async subscribeToTrades(
    symbol: string,
    callback: (trade: unknown) => void
  ): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.subscribeToTrades(symbol, callback);
  }

  async subscribeToOrders(callback: (order: unknown) => void): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.subscribeToOrders(callback);
  }

  getDefaultSymbol(): string {
    return 'BTC_USDC-PERPETUAL';
  }

  formatSymbolForDisplay(symbol: string): string {
    return symbol.replace('_', ' ').replace('-PERPETUAL', ' Perp');
  }
}
