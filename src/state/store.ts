import { getBackendUrl } from '@/lib/backend-url';
import { create } from 'zustand';
import { DeribitClient, DeribitEnvironment, ConnectionState, DeribitCredentials, Instrument, OTOCOOrder, TelemetryHooks, DeribitError } from '@/lib/deribitClient';
import { saveEncrypted, loadEncrypted } from '@/lib/encryption';
import type { ErrorLog } from '@/components/dialogs/ErrorDetailsDialog';
import { calculatePosition, buildBracket, type RiskMode, type RiskEngineInput } from '@/lib/riskEngine';
import { ScalpingStrategy, DEFAULT_SCALPING_CONFIG, type ActivePosition } from '@/lib/strategies/scalpingStrategy';
import { FastTestStrategy, DEFAULT_FAST_TEST_CONFIG } from '@/lib/strategies/fastTestStrategy';
import { VortexStrategy, DEFAULT_VORTEX_CONFIG } from '@/lib/strategies/vortexStrategy';
import { RazorStrategy, DEFAULT_RAZOR_CONFIG } from '@/lib/strategies/razorStrategy';
import { backendClient } from '@/lib/backend-client';
import { backendStrategyClient } from '@/lib/backend-strategy-client';
import { createTelegramNotifier, type TelegramConfig, type TradeNotification, type ErrorNotification } from '@/lib/telegram';
import { backendAPI } from '@/lib/backend-api';

// Helper to access localStorage (replaces legacy Spark KV)
// For standalone deployment - no external dependencies needed!
const safeKV = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const stored = localStorage.getItem(`tradebaas:${key}`);
      if (stored === null) return undefined;
      return JSON.parse(stored) as T;
    } catch (error) {
      console.error(`[Store] Failed to get localStorage key "${key}":`, error);
      return undefined;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(`tradebaas:${key}`, JSON.stringify(value));
    } catch (error) {
      console.error(`[Store] Failed to set localStorage key "${key}":`, error);
    }
  },
  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(`tradebaas:${key}`);
    } catch (error) {
      console.error(`[Store] Failed to delete localStorage key "${key}":`, error);
    }
  }
};

// Strategy name mapping helpers (frontend > backend)
const STRATEGY_NAME_MAP: Record<string, string> = {
  razor: 'Razor',
  thor: 'Thor',
};

const STRATEGY_ID_MAP: Record<string, string> = {
  Razor: 'razor',
  Thor: 'thor',
};

function strategyNameToId(name: string): string {
  return STRATEGY_ID_MAP[name] || name;
}

function strategyIdToName(id: string): string {
  return STRATEGY_NAME_MAP[id] || id;
}

export interface RiskSettings {
  mode: RiskMode;
  value: number;
}

interface TestOrderResult {
  orderId: string;
  instrumentName: string;
  entryPrice: number;
  amount: number;
  stopLoss: number;
  takeProfit: number;
}

export type StrategyStatus = 'stopped' | 'analyzing' | 'active' | 'paused' | 'in-position';

interface TradingStore {
  client: DeribitClient | null;
  connectionState: ConnectionState;
  environment: DeribitEnvironment;
  credentials: DeribitCredentials | null;
  error: string | null;
  usdcBalance: number | null;
  errorLogs: ErrorLog[];
  strategyErrorLogs: ErrorLog[];
  riskSettings: RiskSettings;
  
  strategy: ScalpingStrategy | FastTestStrategy | VortexStrategy | RazorStrategy | null;
  strategyStatus: StrategyStatus;
  activePosition: ActivePosition | null;
  selectedStrategy: string;
  positionMonitorInterval: number | null;
  wasStrategyStopped: boolean;
  backendStatusInterval: number | null;
  realTimeConnectionInterval: number | null;
  
  initializeClient: () => void;
  setEnvironment: (env: DeribitEnvironment) => void;
  connect: (credentials: DeribitCredentials) => Promise<void>;
  disconnect: () => void;
  killSwitch: () => void;
  loadSavedCredentials: () => Promise<void>;
  clearError: () => void;
  fetchUSDCBalance: () => Promise<void>;
  placeTestMicroOrder: (useRiskEngine?: boolean) => Promise<TestOrderResult>;
  addErrorLog: (log: ErrorLog) => void;
  clearErrorLogs: () => void;
  addStrategyErrorLog: (log: ErrorLog) => void;
  clearStrategyErrorLogs: () => void;
  setRiskSettings: (settings: RiskSettings) => void;
  getClient: () => DeribitClient | null;
  
  startStrategy: (strategyId: string) => Promise<void>;
  stopStrategy: (userInitiated?: boolean) => void;
  setSelectedStrategy: (strategyId: string) => void;
  checkForOpenPosition: () => Promise<void>;
  closePosition: () => Promise<void>;
  getAnalysisState: () => ReturnType<ScalpingStrategy['getAnalysisState'] | FastTestStrategy['getAnalysisState'] | VortexStrategy['getAnalysisState'] | RazorStrategy['getAnalysisState']> | null;
  startPositionMonitor: () => void;
  stopPositionMonitor: () => void;
  startRealTimeConnectionPolling: () => void;
  stopRealTimeConnectionPolling: () => void;
  startBackendStatusPolling: () => void;
  stopBackendStatusPolling: () => void;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  client: null,
  connectionState: 'Stopped',
  environment: 'live',
  credentials: null,
  error: null,
  usdcBalance: null,
  errorLogs: [],
  strategyErrorLogs: [],
  riskSettings: {
    mode: 'percent',
    value: 1,
  },
  
  strategy: null,
  strategyStatus: 'stopped',
  activePosition: null,
  selectedStrategy: '',
  positionMonitorInterval: null as number | null,
  wasStrategyStopped: false,
  backendStatusInterval: null as number | null,
  realTimeConnectionInterval: null as number | null,

  initializeClient: () => {
    const { environment, addErrorLog } = get();
    
    const getTelemetryEnabled = async () => {
      const enabled = await safeKV.get<string>('telemetry-enabled');
      return enabled === 'true';
    };
    
    const getTelegramConfig = async (): Promise<TelegramConfig> => {
      const botToken = await safeKV.get<string>('telegram-bot-token') || '';
      const chatId = await safeKV.get<string>('telegram-chat-id') || '';
      const enabledStr = await safeKV.get<string>('telegram-enabled') || 'false';
      
      return {
        botToken,
        chatId,
        enabled: enabledStr === 'true',
      };
    };
    
    const sendTelegramNotification = async (notification: TradeNotification) => {
      try {
        const config = await getTelegramConfig();
        
        if (!config.enabled || !config.botToken || !config.chatId) {
          return;
        }
        
        const notifier = createTelegramNotifier(config);
        
        if (notification.type === 'TRADE_OPENED') {
          await notifier.sendTradeOpened(notification);
        } else if (notification.type === 'TRADE_CLOSED') {
          await notifier.sendTradeClosed(notification);
        }
      } catch (error) {
        console.error('[Telegram] Failed to send notification:', error);
      }
    };
    
    const telemetryHooks: TelemetryHooks = {
      onRPC: async (method, params, duration, success) => {
        const enabled = await getTelemetryEnabled();
        if (enabled) {
          console.log(`[RPC] ${method} - ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`);
        }
      },
      onWS: async (event, details) => {
        const enabled = await getTelemetryEnabled();
        if (enabled) {
          console.log(`[WebSocket] ${event}`, details);
        }
        if (event === 'error' && details) {
          const error: ErrorLog = {
            id: `error-ws-${Date.now()}`,
            timestamp: Date.now(),
            errorType: 'WEBSOCKET_ERROR',
            message: `WebSocket ${event}: ${JSON.stringify(details)}`,
            context: {
              action: 'websocket',
              event,
              details,
            },
          };
          addErrorLog(error);
        }
      },
      onFill: async (fill) => {
        const enabled = await getTelemetryEnabled();
        if (enabled) {
          console.log('[Fill]', fill);
        }
      },
      onOrderUpdate: async (order) => {
        const enabled = await getTelemetryEnabled();
        if (enabled) {
          console.log('[Order Update]', order);
        }
      },
    };

    const client = new DeribitClient(environment, (state) => {
      set({ connectionState: state });
    }, telemetryHooks);
    
    set({ client });
  },

  setEnvironment: (env) => {
    const { client } = get();
    set({ environment: env });
    client?.setEnvironment(env);
  },

  connect: async (credentials) => {
    const { environment } = get();
    
    set({ error: null, credentials, connectionState: 'Connecting' });

    try {
      // Use backend API instead of client-side connection
      const result = await backendAPI.connect(credentials, environment);
      
      if (result.success) {
        set({ connectionState: 'Active' });
        
        // Wait a bit for backend to fully establish connection before starting polling
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Start polling backend status
        get().startBackendStatusPolling();
        
        // Start real-time connection polling
        get().startRealTimeConnectionPolling();
        
        // Start position monitor
        get().startPositionMonitor();
        
        console.log('[Store] Connected via backend API');
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verbinding mislukt';
      set({ error: errorMessage, connectionState: 'Error' });
      throw error;
    }
  },

  disconnect: () => {
  const { strategy, stopPositionMonitor, stopBackendStatusPolling, stopRealTimeConnectionPolling, usdcBalance } = get();
    
    if (strategy) {
      strategy.stop();
    }
    
    stopPositionMonitor();
    stopBackendStatusPolling();
    stopRealTimeConnectionPolling();
    
    // Use backend API instead of client-side disconnect
    backendAPI.disconnect().catch((err) => {
      console.error('[Store] Backend disconnect failed:', err);
    });
    
    // Cache the last balance before clearing UI state
    if (typeof usdcBalance === 'number' && usdcBalance > 0) {
      safeKV.set('last-usdc-balance', usdcBalance).catch(() => {});
    }

    set({ 
      connectionState: 'Stopped', 
      error: null, 
      // Keep balance visible on UI across manual disconnects; do not force null
      strategy: null,
      strategyStatus: 'stopped',
      activePosition: null,
    });
  },

  killSwitch: () => {
  const { client, strategy, stopPositionMonitor, usdcBalance } = get();
    
    console.log('[Store] Kill switch activated, stopping all strategies on backend...');
    
    // Stop all strategies on backend
    backendStrategyClient.killSwitch().then((response) => {
      if (response.success) {
        console.log('[Store] Backend kill switch successful');
      } else {
        console.error('[Store] Backend kill switch failed:', response.message);
      }
    }).catch((err) => {
      console.error('[Store] Could not activate backend kill switch:', err);
    });
    
    if (strategy) {
      strategy.stop();
    }
    
    stopPositionMonitor();
    
    client?.disconnect();
    // Cache last known balance to avoid UI flashing 0 after kill switch
    if (typeof usdcBalance === 'number' && usdcBalance > 0) {
      safeKV.set('last-usdc-balance', usdcBalance).catch(() => {});
    }

    set({ 
      connectionState: 'Stopped', 
      error: null, 
      // Keep previous balance rendered; it will update on next reconnect
      strategy: null,
      strategyStatus: 'stopped',
      activePosition: null,
      wasStrategyStopped: false,
    });
  },

  loadSavedCredentials: async () => {
    try {
      // Try to load from backend first via backendAPI (avoids calling frontend origin)
      try {
        const data = await backendAPI.getCredentials('deribit');
        if (data && data.success && data.credentials) {
          console.log('[Store] Loaded credentials from backend');
          // Map generic credentials to DeribitCredentials format
          set({ 
            credentials: {
              apiKey: (data.credentials as any).api_key || (data.credentials as any).apiKey || '',
              apiSecret: (data.credentials as any).api_secret || (data.credentials as any).apiSecret || '',
            }
          });
          return;
        }
      } catch (errInner) {
        // If the backend returned HTML or non-JSON, treat as missing
        console.warn('[Store] Backend credentials call failed or returned non-JSON, falling back to local storage', errInner);
      }
      
      // Fallback to encrypted local storage (old method)
      console.log('[Store] No backend credentials, trying local storage');
      const apiKey = await loadEncrypted('deribit_api_key');
      const apiSecret = await loadEncrypted('deribit_api_secret');

      if (apiKey && apiSecret) {
        set({ credentials: { apiKey, apiSecret } });
      }
    } catch (error) {
      console.error('[Store] Kon opgeslagen credentials niet laden:', error);
    }
  },

  clearError: () => {
    set({ error: null });
  },

  fetchUSDCBalance: async () => {
    const { connectionState } = get();

    if (connectionState !== 'Active') {
      return;
    }

    try {
      // Fetch balance from backend API
      const prev = get().usdcBalance;
      const result = await backendAPI.getBalance();

      // If backend returns a positive balance, accept and cache it
      if (typeof result.balance === 'number' && result.balance > 0) {
        set({ usdcBalance: result.balance });
        // Cache last known balance to smooth over transient reconnects
        try { await safeKV.set('last-usdc-balance', result.balance); } catch {}
        console.log('[Store] USDC Balance fetched from backend:', result.balance);
        return;
      }

      // If we get 0 (likely during reconnect/429), keep previous value if present
      if (prev !== null && (result.balance === 0 || Number.isNaN(result.balance))) {
        console.warn('[Store] Suppressing transient 0 balance update; keeping previous balance:', prev);
        return;
      }

      // If no previous value, try to restore last cached balance instead of showing 0
      if (prev === null) {
        try {
          const cached = await safeKV.get<number>('last-usdc-balance');
          if (typeof cached === 'number' && cached > 0) {
            set({ usdcBalance: cached });
            console.log('[Store] Restored cached USDC balance:', cached);
            return;
          }
        } catch {}
      }

      // Fall back to whatever came back (could be 0) only when nothing else available
      set({ usdcBalance: result.balance });
      console.log('[Store] USDC Balance (fallback) set to:', result.balance);
    } catch (error) {
      console.error('Kon USDC balance niet ophalen van backend:', error);
      // On errors, keep previous value; if none, try cached
      const prev = get().usdcBalance;
      if (prev === null) {
        try {
          const cached = await safeKV.get<number>('last-usdc-balance');
          if (typeof cached === 'number' && cached > 0) {
            set({ usdcBalance: cached });
            console.log('[Store] Restored cached USDC balance after error:', cached);
          }
        } catch {}
      }
    }
  },

  addErrorLog: (log: ErrorLog) => {
    set((state) => {
      const isDuplicate = state.errorLogs.some(
        (existingLog) =>
          existingLog.errorType === log.errorType &&
          existingLog.message === log.message &&
          existingLog.context?.action === log.context?.action &&
          Math.abs(existingLog.timestamp - log.timestamp) < 2000
      );

      if (isDuplicate) {
        console.log('Dubbele error gedetecteerd, overslaan:', log.errorType, log.message);
        return state;
      }

      return {
        errorLogs: [log, ...state.errorLogs].slice(0, 50),
      };
    });
  },

  clearErrorLogs: () => {
    set({ errorLogs: [] });
  },

  addStrategyErrorLog: (log: ErrorLog) => {
    set((state) => {
      const isDuplicate = state.strategyErrorLogs.some(
        (existingLog) =>
          existingLog.errorType === log.errorType &&
          existingLog.message === log.message &&
          existingLog.context?.action === log.context?.action &&
          Math.abs(existingLog.timestamp - log.timestamp) < 2000
      );

      if (isDuplicate) {
        console.log('Dubbele strategy error gedetecteerd, overslaan:', log.errorType, log.message);
        return state;
      }

      console.error('[CRITICAL ERROR] Strategy error detected, stopping strategy:', log.errorType, log.message);
      
      if (state.strategy) {
        console.log('[Store] Auto-stopping strategy due to error');
        state.strategy.stop();
        set({ 
          strategy: null, 
          strategyStatus: state.activePosition ? 'in-position' : 'stopped',
          wasStrategyStopped: true,
        });
        
        if (!state.activePosition) {
          safeKV.delete('last-active-strategy');
        }
      }
      
      const recentErrors = [...state.strategyErrorLogs].slice(0, 10);
      const errorCount = recentErrors.filter(e => 
        Date.now() - e.timestamp < 60000
      ).length;
      
      if (errorCount >= 5) {
        console.error('[CIRCUIT BREAKER] Too many errors in short time, disconnecting client...');
        if (state.client) {
          state.client.disconnect();
        }
        set({ 
          connectionState: 'Stopped',
          error: 'Te veel errors gedetecteerd - verbinding verbroken voor veiligheid',
        });
      }

      return {
        strategyErrorLogs: [log, ...state.strategyErrorLogs].slice(0, 100),
      };
    });
  },

  clearStrategyErrorLogs: () => {
    set({ strategyErrorLogs: [] });
  },

  placeTestMicroOrder: async (useRiskEngine = false) => {
    const { connectionState, environment, addErrorLog } = get();

    if (connectionState !== 'Active') {
      const error: ErrorLog = {
        id: `error-${Date.now()}`,
        timestamp: Date.now(),
        errorType: 'CONNECTION_ERROR',
        message: 'Niet verbonden met Deribit',
        context: {
          action: 'placeTestMicroOrder',
          connectionState: connectionState,
          environment: environment,
        },
      };
      addErrorLog(error);
      const errorWithLog = new Error('Niet verbonden met Deribit') as Error & { errorLog: ErrorLog };
      errorWithLog.errorLog = error;
      throw errorWithLog;
    }

    try {
      console.log('[Store] Placing test micro order via backend...');
      
      // Use new backend endpoint that includes SL/TP logic
      const response = await fetch(`http://${window.location.hostname}:3000/api/v2/test-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Empty JSON object
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Test order failed');
      }

      console.log('[Store] Test order placed successfully:', result);

      return {
        orderId: result.orderId || 'unknown',
        instrumentName: result.instrumentName || 'BTC_USDC-PERPETUAL',
        entryPrice: result.entryPrice || 0,
        amount: result.amount || 0,
        stopLoss: result.stopLoss || 0,
        takeProfit: result.takeProfit || 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const errorLog: ErrorLog = {
        id: `error-${Date.now()}`,
        timestamp: Date.now(),
        errorType: 'ORDER_PLACEMENT_ERROR',
        message: errorMessage,
        context: {
          action: 'placeTestMicroOrder',
          environment: environment,
          connectionState: connectionState,
        },
      };
      
      addErrorLog(errorLog);
      const errorWithLog = new Error(errorMessage) as Error & { errorLog: ErrorLog };
      errorWithLog.errorLog = errorLog;
      throw errorWithLog;
    }
  },
  
  setRiskSettings: (settings: RiskSettings) => {
    set({ riskSettings: settings });
    // Risk settings are now passed directly to strategy start request
    console.log('[Store] Risk settings updated locally:', settings);
  },
  
  getClient: () => {
    return get().client;
  },
  
  setSelectedStrategy: (strategyId: string) => {
    set({ selectedStrategy: strategyId });
  },
  
  checkForOpenPosition: async () => {
    const { connectionState } = get();
    
    if (connectionState !== 'Active') {
      return;
    }
    
    try {
      // Use backend API to get backend strategy status AND positions
      const statusResult = await backendAPI.getStatus();
      const positionsResult = await backendAPI.getPositions();
      
      if (!positionsResult.success) {
        console.error('[Store] Failed to check for open position:', positionsResult.error);
        return;
      }
      
      const positions = positionsResult.positions;
      const openPosition = positions.find(p => p.size !== 0);
      
      // Get strategy info from backend
      const backendStrategyName = statusResult.strategyName;
      const isRunningOnBackend = statusResult.isRunning;
      
      if (openPosition) {
        const savedStrategyId = await safeKV.get<string>('last-active-strategy');
        const lastPositionStrategy = await safeKV.get<string>('last-position-strategy');
        
        // PRIORITY: Use backend strategy name first, then last position strategy, then saved strategy
        // This ensures that after refresh the correct strategy is selected even if backend state is cleared
        const strategyNameFromBackend = backendStrategyName ? strategyIdToName(backendStrategyName) : null;
        const strategyToSelect = strategyNameFromBackend || lastPositionStrategy || savedStrategyId || 'Razor'; // Default to Razor
        
        console.log('[Store] Open position detected:', {
          instrument: openPosition.instrument_name,
          backendStrategy: backendStrategyName,
          lastPositionStrategy: lastPositionStrategy,
          savedStrategy: savedStrategyId,
          selecting: strategyToSelect,
          backendRunning: isRunningOnBackend,
        });
        
        set({ 
          selectedStrategy: strategyToSelect,
          strategyStatus: 'in-position',
          strategy: null,
          activePosition: {
            id: `position-${Date.now()}`,
            orderId: openPosition.average_price.toString(),
            instrumentName: openPosition.instrument_name,
            side: openPosition.direction === 'buy' ? 'buy' : 'sell',
            entryPrice: openPosition.average_price,
            amount: Math.abs(openPosition.size),
            stopPrice: 0,
            takeProfitPrice: 0,
            entryTime: Date.now(),
            confidence: 0,
            strategyName: backendStrategyName || 'razor', // Always set strategy name
          },
        });
      } else {
        // No open position
        console.log('[Store] No open position detected');
        
        // If backend is running strategy, set status to analyzing/active
        if (isRunningOnBackend && backendStrategyName) {
          const savedStrategyId = await safeKV.get<string>('last-active-strategy');
          set({
            strategyStatus: 'analyzing', // Backend is monitoring
            selectedStrategy: savedStrategyId || '',
          });
        } else {
          // No position, no running strategy → stopped
          set({ strategyStatus: 'stopped' });
        }
      }
    } catch (error) {
      console.error('Failed to check for open position:', error);
    }
  },
  
  startStrategy: async (strategyId: string) => {
    const { usdcBalance, riskSettings, strategy, addStrategyErrorLog, connectionState, environment } = get();
    
    if (!usdcBalance) {
      throw new Error('Balance not available');
    }
    
    if (connectionState !== 'Active') {
      throw new Error('Not connected to broker');
    }
    
    // CRITICAL: Check if position exists
    // If position exists, DON'T start strategy - just queue it!
    const result = await backendAPI.getPositions();
    
    if (!result.success) {
      throw new Error('Failed to check for open positions');
    }
    
    const positions = result.positions;
    const openPosition = positions.find(p => p.size !== 0);
    
    if (openPosition) {
      // Position open - just save strategy ID and set wasStrategyStopped=false
      // Strategy will auto-start after position closes
      console.log('[Store] Position open, queuing strategy for after position close');
      await safeKV.set('last-active-strategy', strategyId);
      set({ 
        wasStrategyStopped: false,
        selectedStrategy: strategyId,
        strategyStatus: 'paused', // Still paused, but now queued
      });
      return; // DON'T start backend strategy!
    }
    
    if (strategy) {
      strategy.stop();
    }
    
    console.log('[Store] Starting strategy on backend for 24/7 execution');
    set({ wasStrategyStopped: false });
    
    await safeKV.set('last-active-strategy', strategyId);
    
    // Check if disclaimer was accepted
    const disclaimerAccepted = await safeKV.get<boolean>('disclaimer-accepted');
    
    // Convert strategy ID to friendly name for backend (use helper)
    const strategyName = strategyIdToName(strategyId);
    
    // Start strategy on backend (PRIMARY execution - orders + SL/TP!)
    console.log('[Store] Sending strategy to backend for 24/7 execution with order placement...');
    const backendResponse = await backendStrategyClient.startStrategy({
      strategyName,
      instrument: 'BTC_USDC-PERPETUAL',
      environment: environment,
      disclaimerAccepted: disclaimerAccepted || false,
      config: {
        riskMode: riskSettings.mode,
        riskValue: riskSettings.value,
      },
    });
    
    if (!backendResponse.success) {
      throw new Error(`Backend strategy start failed: ${backendResponse.message}`);
    }
    
    console.log('[Store] Strategy successfully started on backend with order placement:', backendResponse.strategyId);
    
    // Update UI to show strategy is running on backend
    set({ 
      strategyStatus: 'analyzing',
      selectedStrategy: strategyId,
    });
    
    // Note: Strategies now run on the backend, not locally in browser
    // This enables 24/7 trading without keeping browser open
  },
  
  stopStrategy: (userInitiated: boolean = true) => {
    const { strategy, activePosition } = get();
    
    if (userInitiated) {
      console.log('[Store] User manually stopping strategy, calling backend stop API');
      
      // Get the currently running strategy from backend to stop it
      backendStrategyClient.getStrategyStatus().then(async (statusResponse) => {
        if (statusResponse.success && statusResponse.strategies.length > 0) {
          for (const backendStrategy of statusResponse.strategies) {
            console.log('[Store] Stopping backend strategy:', backendStrategy.id);
            await backendStrategyClient.stopStrategy({ strategyId: backendStrategy.id });
          }
        }
      }).catch((err) => {
        console.warn('[Store] Could not stop backend strategy:', err);
      });
    } else {
      console.log('[Store] System pausing strategy (position opened), auto-resume after position closes');
    }
    
    if (strategy) {
      strategy.stop();
      
      // NEW LOGIC:
      // - If position open → 'paused' (will auto-resume)
      // - If NO position → 'stopped' (won't auto-resume)
      const newStatus = activePosition ? 'paused' : 'stopped';
      
      set({ 
        strategy: null, 
        strategyStatus: newStatus,
        wasStrategyStopped: userInitiated && !activePosition ? true : false,
      });
      
      // Only delete saved strategy if user stops WITHOUT position
      if (!activePosition && userInitiated) {
        safeKV.delete('last-active-strategy');
      }
    } else {
      // No local strategy running, but might be running on backend
      const newStatus = activePosition ? 'paused' : 'stopped';
      
      set({ 
        strategyStatus: newStatus,
        wasStrategyStopped: userInitiated && !activePosition ? true : false,
      });
      
      // Only delete saved strategy if user stops WITHOUT position
      if (!activePosition && userInitiated) {
        safeKV.delete('last-active-strategy');
      }
    }
  },
  
  closePosition: async () => {
    const { activePosition } = get();
    
    if (!activePosition) {
      throw new Error('No active position to close');
    }
    
    console.log('[Store] Closing position and cancelling all related orders...');
    
    // Use backend API to get ticker
    const tickerResult = await backendAPI.getTicker(activePosition.instrumentName);
    
    if (!tickerResult.success || !tickerResult.ticker) {
      throw new Error('Failed to get ticker from backend');
    }
    
    const exitPrice = tickerResult.ticker.mark_price;
    
    const pnl = activePosition.side === 'buy' 
      ? (exitPrice - activePosition.entryPrice) * activePosition.amount
      : (activePosition.entryPrice - exitPrice) * activePosition.amount;
    
    const pnlPercent = ((pnl / activePosition.entryPrice) / activePosition.amount) * 100;
    
    // Use backend API to close position
    await backendAPI.closePosition(activePosition.instrumentName);
    console.log('[Store] Position closed via backend');
    
    await sendTelegramNotification({
      type: 'TRADE_CLOSED',
      instrument: activePosition.instrumentName,
      side: activePosition.side,
      entry: activePosition.entryPrice,
      stopLoss: activePosition.stopPrice,
      takeProfit: activePosition.takeProfitPrice,
      amount: activePosition.amount,
      strategy: activePosition.strategyName || 'Handmatig',
      exitPrice: exitPrice,
      pnl: pnl,
      pnlPercent: pnlPercent,
      reason: 'Handmatig gesloten',
    });
    
    const savedStrategyId = await safeKV.get<string>('last-active-strategy');
    const wasStrategyStopped = get().wasStrategyStopped;
    
    if (savedStrategyId === 'disabled') {
      console.log('[Store] Trading was disabled by user, not auto-restarting');
      await safeKV.delete('last-active-strategy');
      set({ activePosition: null, strategyStatus: 'stopped' });
      return;
    }
    
    if (savedStrategyId && !wasStrategyStopped) {
      console.log('[Store] Position manually closed, auto-restarting strategy:', savedStrategyId);
      set({ activePosition: null });
      
      try {
        await get().startStrategy(savedStrategyId);
      } catch (error) {
        console.error('[Store] Failed to auto-restart strategy:', error);
        set({ strategyStatus: 'stopped' });
      }
    } else {
      console.log('[Store] Strategy was manually stopped or no strategy found, not auto-restarting');
      set({ activePosition: null, strategyStatus: 'stopped' });
    }
  },
  
  getAnalysisState: () => {
    const { strategy } = get();
    
    if (!strategy || !strategy.isActive()) {
      return null;
    }
    
    return strategy.getAnalysisState();
  },
  
  startPositionMonitor: () => {
    const { positionMonitorInterval } = get();
    
    if (positionMonitorInterval !== null) {
      return;
    }
    
    console.log('[Store] Starting position monitor...');
    
    const intervalId = window.setInterval(async () => {
      const { activePosition, selectedStrategy, startStrategy, wasStrategyStopped, connectionState } = get();
      
      if (connectionState !== 'Active') {
        return;
      }
      
      try {
        // Use backend API instead of client
        const result = await backendAPI.getPositions();
        
        if (!result.success) {
          console.error('[Store] Position monitor: Failed to get positions:', result.error);
          return;
        }
        
        const positions = result.positions;
        const openPosition = positions.find(p => p.size !== 0);
        
        if (activePosition && !openPosition) {
          console.log('[Store] Position was closed externally (SL/TP hit or manual closure in Deribit)');
          
          let exitPrice = activePosition.entryPrice;
          let pnl = 0;
          let pnlPercent = 0;
          let closeReason = 'Positie gesloten';
          
          try {
            // Use backend API to get ticker
            const tickerResult = await backendAPI.getTicker(activePosition.instrumentName);
            if (tickerResult.success && tickerResult.ticker) {
              exitPrice = tickerResult.ticker.mark_price;
              
              pnl = activePosition.side === 'buy' 
                ? (exitPrice - activePosition.entryPrice) * activePosition.amount
                : (activePosition.entryPrice - exitPrice) * activePosition.amount;
              
              pnlPercent = ((pnl / activePosition.entryPrice) / activePosition.amount) * 100;
              
              if (activePosition.stopPrice && Math.abs(exitPrice - activePosition.stopPrice) < activePosition.entryPrice * 0.001) {
                closeReason = 'Stop loss geraakt';
              } else if (activePosition.takeProfitPrice && Math.abs(exitPrice - activePosition.takeProfitPrice) < activePosition.entryPrice * 0.001) {
                closeReason = 'Take profit geraakt';
              } else {
                closeReason = 'Extern/handmatig gesloten';
              }
            }
          } catch (tickerError) {
            console.error('[Store] Failed to get exit price, using estimates:', tickerError);
            
            if (activePosition.stopPrice) {
              closeReason = 'Stop loss geraakt (waarschijnlijk)';
              exitPrice = activePosition.stopPrice;
              pnl = activePosition.side === 'buy' 
                ? (exitPrice - activePosition.entryPrice) * activePosition.amount
                : (activePosition.entryPrice - exitPrice) * activePosition.amount;
              pnlPercent = ((pnl / activePosition.entryPrice) / activePosition.amount) * 100;
            } else if (activePosition.takeProfitPrice) {
              closeReason = 'Take profit geraakt (waarschijnlijk)';
              exitPrice = activePosition.takeProfitPrice;
              pnl = activePosition.side === 'buy' 
                ? (exitPrice - activePosition.entryPrice) * activePosition.amount
                : (activePosition.entryPrice - exitPrice) * activePosition.amount;
              pnlPercent = ((pnl / activePosition.entryPrice) / activePosition.amount) * 100;
            }
          }
          
          try {
            console.log('[Store] Sending Telegram notification for closed position:', {
              instrument: activePosition.instrumentName,
              side: activePosition.side,
              entry: activePosition.entryPrice,
              exit: exitPrice,
              pnl,
              reason: closeReason,
            });
            
            await sendTelegramNotification({
              type: 'TRADE_CLOSED',
              instrument: activePosition.instrumentName,
              side: activePosition.side,
              entry: activePosition.entryPrice,
              stopLoss: activePosition.stopPrice,
              takeProfit: activePosition.takeProfitPrice,
              amount: activePosition.amount,
              strategy: activePosition.strategyName || 'Onbekend',
              exitPrice: exitPrice,
              pnl: pnl,
              pnlPercent: pnlPercent,
              reason: closeReason,
            });
            
            console.log('[Store] Telegram notification sent successfully');
          } catch (telegramError) {
            console.error('[Store] Failed to send Telegram notification for position closure:', telegramError);
          }
          
          set({ activePosition: null });
          
          // Clear the last-position-strategy since position is now closed
          await safeKV.delete('last-position-strategy');
          
          const savedStrategyId = await safeKV.get<string>('last-active-strategy');
          
          if (savedStrategyId === 'disabled') {
            console.log('[Store] Trading was disabled by user, not auto-restarting');
            await safeKV.delete('last-active-strategy');
            set({ strategyStatus: 'stopped' });
            return;
          }
          
          // Determine which strategy to restart
          // Priority: 1) activePosition.strategyName, 2) selectedStrategy, 3) savedStrategyId, 4) 'Razor' default
          const strategyToRestart = activePosition.strategyName 
            ? strategyIdToName(activePosition.strategyName)
            : selectedStrategy || savedStrategyId || 'Razor';
          
          if (strategyToRestart && !wasStrategyStopped) {
            console.log('[Store] Auto-restarting strategy:', strategyToRestart, {
              fromActivePosition: activePosition.strategyName,
              fromSelectedStrategy: selectedStrategy,
              fromSavedStrategy: savedStrategyId,
            });
            try {
              // Set the strategy in dropdown BEFORE restarting
              set({ selectedStrategy: strategyToRestart });
              await startStrategy(strategyToRestart);
            } catch (error) {
              console.error('[Store] Failed to auto-restart strategy:', error);
              set({ strategyStatus: 'stopped' });
            }
          } else {
            console.log('[Store] Strategy was manually stopped, not auto-restarting');
            set({ strategyStatus: 'stopped' });
          }
        }
        
        if (!activePosition && openPosition) {
          console.log('[Store] External position detected, syncing...');
          const savedStrategyId = await safeKV.get<string>('last-active-strategy');
          
          set({ 
            activePosition: {
              id: `external-${Date.now()}`,
              orderId: openPosition.average_price.toString(),
              instrumentName: openPosition.instrument_name,
              side: openPosition.direction === 'buy' ? 'buy' : 'sell',
              entryPrice: openPosition.average_price,
              amount: Math.abs(openPosition.size),
              stopPrice: 0,
              takeProfitPrice: 0,
              entryTime: Date.now(),
              confidence: 0,
            },
            strategyStatus: 'in-position',
            selectedStrategy: savedStrategyId || '',
          });
        }
      } catch (error) {
        console.error('[Store] Position monitor error:', error);
      }
    }, 3000);
    
    set({ positionMonitorInterval: intervalId });
  },
  
  stopPositionMonitor: () => {
    const { positionMonitorInterval } = get();
    
    if (positionMonitorInterval !== null) {
      console.log('[Store] Stopping position monitor...');
      clearInterval(positionMonitorInterval);
      set({ positionMonitorInterval: null });
    }
  },

  // NEW: Real-time connection status polling (1 second interval)
  startRealTimeConnectionPolling: () => {
    const { realTimeConnectionInterval } = get();
    
    // Don't start if already running
    if (realTimeConnectionInterval !== null) return;
    
    console.log('[Store] Starting real-time connection polling...');
    
    // Poll every 1 second for real-time updates
    const interval = window.setInterval(async () => {
      try {
        // Dynamic backend URL - uses same host as frontend
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/connection/status`);
        const data = await response.json();
        
        if (data.success) {
          const currentState = get().connectionState;
          
          // ✅ CRITICAL FIX: Only update if manuallyDisconnected is explicitly set
          if (data.connected && data.websocket.connected) {
            // Backend says connected
            if (currentState !== 'Active') {
              set({ 
                connectionState: 'Active',
                environment: data.environment,
              });
            }
          } else if (data.manuallyDisconnected === true) {
            // Only set to Stopped if it was manually disconnected
            if (currentState === 'Active') {
              console.log('[Store] Manual disconnect detected by real-time poll');
              set({ connectionState: 'Stopped' });
            }
          }
          // If not connected AND not manually disconnected → do nothing
          // This prevents page refresh from triggering disconnect
        }
      } catch (error) {
        console.error('[Store] Real-time connection poll failed:', error);
        // Don't update state on fetch errors (normal during page load)
      }
    }, 1000);
    
    set({ realTimeConnectionInterval: interval });
  },
  
  stopRealTimeConnectionPolling: () => {
    const { realTimeConnectionInterval } = get();
    
    if (realTimeConnectionInterval !== null) {
      console.log('[Store] Stopping real-time connection polling...');
      clearInterval(realTimeConnectionInterval);
      set({ realTimeConnectionInterval: null });
    }
  },

  // Backend status polling (replaces client-side connection state)
  startBackendStatusPolling: () => {
    const { backendStatusInterval } = get();
    
    // Don't start if already running
    if (backendStatusInterval !== null) return;
    
    console.log('[Store] Starting backend status polling...');
    
    // Poll every 3 seconds
    const interval = window.setInterval(async () => {
      try {
        const status = await backendAPI.getStatus();
        const positionsResult = await backendAPI.getPositions();
        
        // Only update connection state if it matches backend reality
        // Don't override 'Connecting' state during initial connection
        const currentState = get().connectionState;
        
        if (status.connection.connected) {
          // Backend says connected - set Active
          if (currentState !== 'Active') {
            set({ 
              connectionState: 'Active',
              environment: status.connection.environment,
            });
            // On reconnect, attempt to restore cached balance immediately to avoid 0 flash
            try {
              const cached = await safeKV.get<number>('last-usdc-balance');
              if (typeof cached === 'number' && cached > 0) {
                set({ usdcBalance: cached });
              }
            } catch {}
          }
          
          // Check for open position
          const openPosition = positionsResult.success 
            ? positionsResult.positions.find(p => p.size !== 0)
            : null;
          
          // CRITICAL: Update strategy status based on backend state AND position state
          if (openPosition) {
            // Position open → check if strategy still running
            const savedStrategyId = await safeKV.get<string>('last-active-strategy');
            const currentSelectedStrategy = get().selectedStrategy;
            
            // Convert backend strategy ID to display name
            const backendStrategyName = status.strategyName ? strategyIdToName(status.strategyName) : null;
            
            // Priority: 1) Backend strategy (source of truth), 2) Current selection, 3) Saved strategy, 4) 'Razor' default
            const strategyToUse = backendStrategyName || currentSelectedStrategy || savedStrategyId || 'Razor';
            
            // Save the strategy that opened this position for persistence across refreshes
            if (strategyToUse && strategyToUse !== 'Razor') {
              await safeKV.set('last-position-strategy', strategyToUse);
            }
            
            // Determine status: 'paused' if strategy stopped, 'in-position' if still analyzing
            const newStatus = status.isRunning ? 'in-position' : 'paused';
            
            console.log('[Store] Backend status poll - position detected:', {
              backendStrategy: status.strategyName,
              backendStrategyName,
              currentSelected: currentSelectedStrategy,
              savedStrategy: savedStrategyId,
              usingStrategy: strategyToUse,
              status: newStatus,
            });
            
            set({ 
              strategyStatus: newStatus,
              selectedStrategy: strategyToUse,
              activePosition: {
                id: `backend-${Date.now()}`,
                orderId: openPosition.average_price.toString(),
                instrumentName: openPosition.instrument_name,
                side: openPosition.direction === 'buy' ? 'buy' : 'sell',
                entryPrice: openPosition.average_price,
                amount: Math.abs(openPosition.size),
                stopPrice: 0,
                takeProfitPrice: 0,
                entryTime: Date.now(),
                confidence: 0,
                strategyName: status.strategyName || 'razor', // Backend strategy ID
              },
            });
          } else if (status.isRunning && status.strategyName) {
            // No position but strategy running → analyzing
            set({ 
              strategyStatus: 'analyzing',
              selectedStrategy: status.strategyName,
              activePosition: null,
            });
          } else {
            // No position, no strategy → stopped
            const currentStatus = get().strategyStatus;
            // Only update if not already stopped to avoid unnecessary re-renders
            if (currentStatus !== 'stopped') {
              set({ 
                strategyStatus: 'stopped',
                activePosition: null,
              });
            }
          }
    } else {
          // Backend says NOT connected
          // ✅ CRITICAL FIX: Only set to 'Stopped' if manuallyDisconnected = true
          // This prevents hard refresh from triggering disconnect
          if (status.connection.manuallyDisconnected === true) {
            console.log('[Store] Backend was manually disconnected, updating frontend state');
            set({ 
              connectionState: 'Stopped',
              strategyStatus: 'stopped',
              activePosition: null,
            });
          } else {
            // Backend not connected but NOT manually disconnected
            // This could be:
            // 1. Backend just started (not connected yet)
            // 2. Connection lost temporarily (network issue)
            // 3. Page refresh (frontend state reset but backend still connected)
            // → Don't change connectionState, let it stay as is or wait for reconnect
            console.log('[Store] Backend not connected but not manually disconnected - preserving frontend state');
      // Preserve current usdcBalance
          }
        }
      } catch (error) {
        console.error('[Store] Backend status poll failed:', error);
        // Don't set error state, just log it
        // Network errors during page load/refresh are normal
      }
    }, 3000);
    
    set({ backendStatusInterval: interval });
  },

  stopBackendStatusPolling: () => {
    const { backendStatusInterval } = get();
    
    if (backendStatusInterval !== null) {
      console.log('[Store] Stopping backend status polling...');
      clearInterval(backendStatusInterval);
      set({ backendStatusInterval: null });
    }
  },
}));

async function sendTelegramNotification(notification: TradeNotification) {
  try {
    const botToken = await safeKV.get<string>('telegram-bot-token');
    const chatId = await safeKV.get<string>('telegram-chat-id');
    const enabled = await safeKV.get<string>('telegram-enabled');
    
    if (enabled === 'true' && botToken && chatId) {
      const config: TelegramConfig = {
        botToken,
        chatId,
        enabled: true,
      };
      
      const notifier = createTelegramNotifier(config);
      
      if (notification.type === 'TRADE_OPENED') {
        await notifier.sendTradeOpened(notification);
      } else if (notification.type === 'TRADE_CLOSED') {
        await notifier.sendTradeClosed(notification);
      }
    }
  } catch (error) {
    console.error('[Telegram] Failed to send notification:', error);
  }
}

async function sendTelegramErrorNotification(error: ErrorLog, strategyName: string) {
  try {
    const botToken = await safeKV.get<string>('telegram-bot-token');
    const chatId = await safeKV.get<string>('telegram-chat-id');
    const enabled = await safeKV.get<string>('telegram-enabled');
    
    if (enabled === 'true' && botToken && chatId) {
      const config: TelegramConfig = {
        botToken,
        chatId,
        enabled: true,
      };
      
      const notifier = createTelegramNotifier(config);
      
      await notifier.sendError({
        strategy: strategyName,
        errorType: String(error.errorType),
        message: error.message,
        action: String(error.context?.action || 'Unknown'),
        timestamp: error.timestamp,
        context: error.context,
      });
    }
  } catch (err) {
    console.error('[Telegram] Failed to send error notification:', err);
  }
}
