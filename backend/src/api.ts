import { BROKER_METADATA, BROKER_WHITELIST } from './brokers/BrokerRegistry';
import { DeribitBroker } from './brokers/DeribitBroker';
import { BinanceBroker } from './brokers/BinanceBroker';
import { BybitBroker } from './brokers/BybitBroker';
import {
  OKXBroker,
  KrakenBroker,
  BitgetBroker,
  KucoinBroker,
  MEXCBroker,
  GateIOBroker,
  BitMEXBroker,
  HuobiBroker,
  PhemexBroker,
  CoinbaseBroker,
  BitstampBroker,
  BitfinexBroker,
} from './brokers/StubBrokers';
import { IBroker, Credentials, type Order } from './brokers/IBroker';
import { StrategyManager, StrategyLifecycleState } from './lifecycle/StrategyManager';
import { MetricsCollector } from './monitoring/metrics';
import { validateInput, strategyStartRequestSchema } from './validation/schemas';
import { log } from './logger';
import { getTradeHistoryService, type TradeRecord, type TradeHistoryStats } from './services/trade-history';

export interface BrokerListResponse {
  success: boolean;
  brokers: Array<{
    id: string;
    name: string;
    logo: string;
    maxLeverage: number;
    supportedPairs: string[];
    docsURL: string;
    features: {
      spot: boolean;
      futures: boolean;
      perpetuals: boolean;
      options: boolean;
      websocket: boolean;
    };
    testnetAvailable: boolean;
  }>;
}

export interface ConnectTestResponse {
  success: boolean;
  brokerId: string;
  message: string;
  error?: string;
}

const brokerInstances = new Map<string, IBroker>();

function getBrokerInstance(brokerId: string): IBroker {
  if (!brokerInstances.has(brokerId)) {
    let broker: IBroker;
    
    switch (brokerId) {
      case 'deribit':
        broker = new DeribitBroker();
        break;
      case 'binance':
        broker = new BinanceBroker();
        break;
      case 'bybit':
        broker = new BybitBroker();
        break;
      case 'okx':
        broker = new OKXBroker();
        break;
      case 'kraken':
        broker = new KrakenBroker();
        break;
      case 'bitget':
        broker = new BitgetBroker();
        break;
      case 'kucoin':
        broker = new KucoinBroker();
        break;
      case 'mexc':
        broker = new MEXCBroker();
        break;
      case 'gateio':
        broker = new GateIOBroker();
        break;
      case 'bitmex':
        broker = new BitMEXBroker();
        break;
      case 'huobi':
        broker = new HuobiBroker();
        break;
      case 'phemex':
        broker = new PhemexBroker();
        break;
      case 'coinbase':
        broker = new CoinbaseBroker();
        break;
      case 'bitstamp':
        broker = new BitstampBroker();
        break;
      case 'bitfinex':
        broker = new BitfinexBroker();
        break;
      default:
        throw new Error(`Unknown broker: ${brokerId}`);
    }
    
    brokerInstances.set(brokerId, broker);
  }
  
  return brokerInstances.get(brokerId)!;
}

export async function handleGetBrokers(): Promise<BrokerListResponse> {
  const brokers = BROKER_WHITELIST.map(id => BROKER_METADATA[id]);
  
  return {
    success: true,
    brokers,
  };
}

export async function handleConnectTest(
  brokerId: string,
  credentials: Credentials
): Promise<ConnectTestResponse> {
  try {
    if (!BROKER_WHITELIST.includes(brokerId)) {
      return {
        success: false,
        brokerId,
        message: 'Broker not supported',
        error: `Broker ${brokerId} is not in whitelist`,
      };
    }

    const broker = getBrokerInstance(brokerId);
    
    await broker.connect(credentials);
    
    const status = broker.getConnectionStatus();
    
    if (status === 'connected') {
      return {
        success: true,
        brokerId,
        message: 'Connection successful',
      };
    } else {
      return {
        success: false,
        brokerId,
        message: 'Connection failed',
        error: `Connection status: ${status}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      brokerId,
      message: 'Connection test failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getBroker(brokerId: string): IBroker | null {
  if (!BROKER_WHITELIST.includes(brokerId)) {
    return null;
  }
  return getBrokerInstance(brokerId);
}

// ============================================================================
// Strategy API (FRONTEND-001)
// ============================================================================

export interface StrategyStatusResponse {
  success: boolean;
  strategy: {
    name: string | null;
    instrument: string | null;
    state: StrategyLifecycleState;
    isActive: boolean;
    startedAt: number | null;
    lastTransition: number;
    position: {
      entryPrice: number | null;
      size: number | null;
      side: 'long' | 'short' | null;
    } | null;
  };
  metrics: {
    uptime: number;
    tradesTotal: number;
    tradesSuccess: number;
    tradesFailed: number;
  };
}

export interface StrategyStartRequest {
  strategyName: string;
  instrument: string;
}

export interface StrategyStartResponse {
  success: boolean;
  message: string;
  strategy?: {
    name: string;
    instrument: string;
    state: StrategyLifecycleState;
  };
  error?: string;
}

export interface StrategyStopResponse {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * GET /api/strategy/status
 * Returns current strategy status
 */
export async function handleGetStrategyStatus(): Promise<StrategyStatusResponse> {
  try {
    const strategyManager = StrategyManager.getInstance();
    const state = strategyManager.getState();
    const metrics = MetricsCollector.getInstance();
    const metricsData = metrics.getMetrics();

    return {
      success: true,
      strategy: {
        name: state.strategyName,
        instrument: state.instrument,
        state: state.state,
        isActive: strategyManager.isStrategyActive(),
        startedAt: state.startedAt,
        lastTransition: state.lastTransition,
        position: state.positionEntryPrice !== null ? {
          entryPrice: state.positionEntryPrice,
          size: state.positionSize,
          side: state.positionSide,
        } : null,
      },
      metrics: {
        uptime: metricsData.uptime_seconds,
        tradesTotal: metricsData.trades_total,
        tradesSuccess: metricsData.trades_success,
        tradesFailed: metricsData.trades_failed,
      },
    };
  } catch (error) {
    throw new Error(`Failed to get strategy status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * POST /api/strategy/start
 * Start a strategy
 */
export async function handleStartStrategy(
  request: StrategyStartRequest
): Promise<StrategyStartResponse> {
  try {
    // Validate inputs using Zod schema
    const validation = validateInput(strategyStartRequestSchema, request);
    
    if (!validation.success) {
      log.warn('Strategy start request validation failed', {
        errors: validation.errors,
        request,
      });
      return {
        success: false,
        message: 'Validation error',
        error: validation.errors.join('; '),
      };
    }

    const { strategyName, instrument } = validation.data;

    const strategyManager = StrategyManager.getInstance();

    // Check if already active
    if (strategyManager.isStrategyActive()) {
      const activeStrategy = strategyManager.getActiveStrategy();
      log.info('Strategy start rejected - strategy already active', {
        activeStrategy,
        requestedStrategy: strategyName,
      });
      return {
        success: false,
        message: `Strategy "${activeStrategy}" is already active`,
        error: 'Single strategy violation',
      };
    }

    // Start strategy
    await strategyManager.startStrategy(strategyName, instrument);

    const state = strategyManager.getState();

    log.info('Strategy started successfully', {
      strategyName,
      instrument,
      state: state.state,
    });

    return {
      success: true,
      message: `Strategy "${strategyName}" started successfully`,
      strategy: {
        name: state.strategyName!,
        instrument: state.instrument!,
        state: state.state,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to start strategy',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * POST /api/strategy/stop
 * Stop the active strategy
 */
export async function handleStopStrategy(): Promise<StrategyStopResponse> {
  try {
    const strategyManager = StrategyManager.getInstance();

    // Check if any strategy is active
    if (!strategyManager.isStrategyActive()) {
      return {
        success: false,
        message: 'No active strategy to stop',
        error: 'No active strategy',
      };
    }

    const strategyName = strategyManager.getActiveStrategy();

    // Stop strategy
    await strategyManager.stopStrategy();

    return {
      success: true,
      message: `Strategy "${strategyName}" stopped successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to stop strategy',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Trade History Endpoints
 */

export interface TradeHistoryResponse {
  success: boolean;
  trades: TradeRecord[];
  total: number;
  error?: string;
}

export interface TradeHistoryStatsResponse {
  success: boolean;
  stats: TradeHistoryStats;
  error?: string;
}

export async function handleGetTradeHistory(params?: {
  strategyName?: string;
  instrument?: string;
  status?: 'open' | 'closed';
  limit?: number;
  offset?: number;
}): Promise<TradeHistoryResponse> {
  try {
    const tradeHistory = getTradeHistoryService();
    const trades = await tradeHistory.queryTrades(params || {});
    
    return {
      success: true,
      trades,
      total: trades.length
    };
  } catch (error) {
    return {
      success: false,
      trades: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function handleGetTradeStats(params?: {
  strategyName?: string;
  instrument?: string;
  startTime?: number;
  endTime?: number;
}): Promise<TradeHistoryStatsResponse> {
  try {
    const tradeHistory = getTradeHistoryService();
    const stats = await tradeHistory.getStats(params);
    
    return {
      success: true,
      stats
    };
  } catch (error) {
    return {
      success: false,
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        slHits: 0,
        tpHits: 0
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Sync current Deribit position to database
 * This is for retroactively adding positions that were opened before SQLite was enabled
 */
export async function handleSyncCurrentPosition(params: {
  strategyName: string;
  instrument: string;
  getPositions: () => Promise<any[]>;
  getOpenOrders: (instrument: string) => Promise<Order[]>;
}): Promise<{ success: boolean; message?: string; tradeId?: string; error?: string }> {
  try {
    const { strategyName, instrument, getPositions, getOpenOrders } = params;
    
    // Get current positions from Deribit
    const positions = await getPositions();
    const position = positions.find((p: any) => 
      (p.instrument_name === instrument || p.instrument === instrument) && p.size !== 0
    );
    
    if (!position) {
      console.log('[API] Available positions:', positions.map((p: any) => ({ instrument: p.instrument_name || p.instrument, size: p.size })));
      return {
        success: false,
        error: `No open position found for ${instrument}`
      };
    }
    
    // Get open orders to find SL/TP
    const orders = await getOpenOrders(instrument);
    const slOrder = orders.find((o: any) => o.type === 'stop_market' && o.label?.includes('_sl'));
    const tpOrder = orders.find((o: any) => o.type === 'limit' && o.label?.includes('_tp'));
    
    // Determine side (buy = long, sell = short)
    const side = position.size > 0 ? 'buy' : 'sell';
    const amount = Math.abs(position.size);
    
    // Record the trade
    const tradeHistory = getTradeHistoryService();
    const tradeId = await tradeHistory.recordTrade({
      strategyName,
      instrument,
      side,
      entryOrderId: 'manual_sync', // We don't have the original order ID
      slOrderId: slOrder?.orderId,
      tpOrderId: tpOrder?.orderId,
      entryPrice: position.average_price || position.mark_price,
      amount,
      stopLoss: slOrder?.price || 0,
      takeProfit: tpOrder?.price || 0
    });
    
    console.log(`[API] ✅ Synced current position to database: ${tradeId}`);
    console.log(`[API] Position: ${instrument} ${side.toUpperCase()} ${amount} @ $${position.average_price}`);
    
    return {
      success: true,
      message: `Position synced to database successfully`,
      tradeId
    };
  } catch (error) {
    console.error('[API] Failed to sync position:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
