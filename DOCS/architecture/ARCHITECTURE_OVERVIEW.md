# Tradebaas - Architectuur Overzicht

**Quick Reference voor Developers**

---

## 🎯 Core Concepts

### 1. State Flow

```
User Action → Zustand Store → Broker Client → Exchange API → State Update → UI Render
```

### 2. Connection Lifecycle

```
Stopped → Connecting → Active → [Trading] → Stopped
   ↓                              ↓
 Error ←──────────────────────────┘
```

### 3. Strategy Execution

```
Start → Load Config → Fetch Balance → Monitor Market → Signal? 
                                           ↓              ↓
                                      Calculate Risk    No Signal
                                           ↓              ↓
                                      Place Entry    Continue Monitor
                                           ↓
                                    Attach Brackets (SL/TP)
                                           ↓
                                    Monitor Position
                                           ↓
                                    Exit (TP/SL hit)
                                           ↓
                                      Continue/Stop
```

---

## 📁 Belangrijkste Bestanden

### Core Application

| Bestand | Functie | Key Exports |
|---------|---------|-------------|
| `src/App.tsx` | Main app component | `default App` |
| `src/state/store.ts` | Global state | `useTradingStore` |
| `src/lib/deribitClient.ts` | WebSocket client | `DeribitClient` |
| `src/lib/riskEngine.ts` | Position sizing | `calculatePosition`, `buildBracket` |

### Components

| Component | Doel |
|-----------|------|
| `StrategyTradingCard` | Strategy selectie & execution |
| `SettingsDialog` | Broker connectie & risk settings |
| `MetricsPage` | Performance metrics |
| `ConnectionStatusDialog` | Connection details |
| `ErrorDetailsDialog` | Error logs viewer |

### Strategies

| Strategy | File | Status |
|----------|------|--------|
| Scalping | `scalpingStrategy.ts` | ✅ Production |
| Fast Test | `fastTestStrategy.ts` | 🧪 Testing |
| Vortex | `thirdIterationStrategy.ts` | ✅ Production |

### Brokers

| Broker | File | Implementation |
|--------|------|----------------|
| Deribit | `DeribitBroker.ts` | ✅ Complete |
| Binance | `BinanceBroker.ts` | 🔨 Stub |
| Bybit | `BybitBroker.ts` | 🔨 Stub |
| OKX | `OKXBroker.ts` | 🔨 Stub |
| Bitget | `BitgetBroker.ts` | 🔨 Stub |

---

## 🔑 Key Interfaces

### TradingStore (State)

```typescript
{
  client: DeribitClient | null;
  connectionState: 'Stopped' | 'Connecting' | 'Active' | 'Error';
  environment: 'live' | 'testnet';
  usdcBalance: number | null;
  strategy: Strategy | null;
  strategyStatus: 'stopped' | 'analyzing' | 'active' | 'in-position';
  activePosition: ActivePosition | null;
  riskSettings: { mode: 'percent' | 'fixed', value: number };
}
```

### IBroker (Broker Interface)

```typescript
interface IBroker {
  connect(credentials, environment): Promise<void>;
  disconnect(): void;
  getBalance(currency?): Promise<BrokerBalance>;
  placeOrder(params): Promise<BrokerOrder>;
  cancelOrder(orderId, symbol): Promise<void>;
  getInstruments(): Promise<BrokerInstrument[]>;
  getCandles(symbol, timeframe): Promise<BrokerCandle[]>;
  subscribeToTrades(symbol, callback): Promise<void>;
}
```

### Strategy (Strategy Interface)

```typescript
interface Strategy {
  start(): Promise<void>;
  stop(): void;
  hasActivePosition(): boolean;
  getAnalysisState(): {
    indicators: Record<string, number>;
    signal: Signal | null;
    candleCount: number;
  };
}
```

---

## 🔧 Configuration

### Risk Settings

```typescript
// Percentage mode: Risk 1% of equity
riskSettings = { mode: 'percent', value: 1 }

// Fixed mode: Risk $10 per trade
riskSettings = { mode: 'fixed', value: 10 }
```

### Broker Rules (Deribit BTC-PERPETUAL)

```typescript
{
  maxLeverage: 50,
  tickSize: 0.5,
  lotSize: 0.0001,
  minTradeAmount: 10,
  contractSize: 0.0001
}
```

### Strategy Config

```typescript
{
  instrument: 'BTC_USDC-PERPETUAL',
  riskMode: 'percent',
  riskValue: 1.5,
  maxLeverage: 50,
  trailMethod: 'swing',
  monitorIntervalMs: 2000
}
```

---

## 🚀 Common Operations

### Connect to Broker

```typescript
const { connect } = useTradingStore();

await connect({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret'
});
```

### Start Strategy

```typescript
const { startStrategy } = useTradingStore();

await startStrategy('third-iteration');
```

### Place Test Order

```typescript
const { placeTestMicroOrder } = useTradingStore();

const result = await placeTestMicroOrder(true); // use risk engine
console.log(result.orderId, result.entryPrice);
```

### Update Risk Settings

```typescript
const { setRiskSettings } = useTradingStore();

setRiskSettings({ mode: 'percent', value: 2 });
```

---

## 📊 Data Persistence

### useKV (Spark KV Storage)

```typescript
import { useKV } from '@github/spark/hooks';

// Persistent data (survives page refresh)
const [settings, setSettings] = useKV('risk-settings', defaultSettings);

// Always use functional updates
setSettings((current) => ({ ...current, value: 2 }));
```

### localStorage (Encrypted)

```typescript
import { saveEncrypted, loadEncrypted } from '@/lib/encryption';

// Save credentials (encrypted)
await saveEncrypted(credentials, 'password');

// Load credentials
const creds = await loadEncrypted(encryptedData, 'password');
```

---

## 🐛 Error Handling

### Error Types

```typescript
type ErrorType = 
  | 'CONNECTION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'INVALID_PARAMS'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_AMOUNT'
  | 'WEBSOCKET_ERROR'
  | 'STRATEGY_ERROR'
  | 'UNKNOWN_ERROR';
```

### Error Log Structure

```typescript
interface ErrorLog {
  id: string;
  timestamp: number;
  errorType: ErrorType;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  apiResponse?: {
    errorCode: string;
    data?: unknown;
  };
}
```

### Add Error to Store

```typescript
const { addErrorLog } = useTradingStore();

addErrorLog({
  id: `error-${Date.now()}`,
  timestamp: Date.now(),
  errorType: 'INVALID_PARAMS',
  message: 'Amount must be multiple of contract size',
  context: { amount: 0.123, contractSize: 0.0001 }
});
```

---

## 🧪 Testing Checklist

### Manual Testing Flow

1. **Connection Test**
   - [ ] Connect to testnet
   - [ ] Verify Active status
   - [ ] Check balance displayed
   - [ ] Test disconnect
   - [ ] Test killswitch

2. **Risk Engine Test**
   - [ ] Set risk to 1% percent mode
   - [ ] Place test order
   - [ ] Verify order size calculated correctly
   - [ ] Check SL/TP prices
   - [ ] Verify leverage within limit

3. **Strategy Test**
   - [ ] Select strategy
   - [ ] Start strategy
   - [ ] Verify "analyzing" status
   - [ ] Wait for signal
   - [ ] Check entry placed
   - [ ] Monitor position
   - [ ] Verify exit on SL/TP

4. **Error Handling Test**
   - [ ] Invalid credentials → Error state
   - [ ] Network disconnect → Auto-reconnect
   - [ ] Invalid order params → Error dialog
   - [ ] Insufficient funds → Clear error message

### Unit Test Commands

```bash
# Run all tests
npm test

# Run specific test suite
npm test risk
npm test bracket
npm test guards

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 🔐 Security Checklist

- [ ] API credentials encrypted at rest
- [ ] Credentials masked in UI
- [ ] No credentials in logs
- [ ] Rate limiting active
- [ ] Request timeouts configured
- [ ] CORS properly configured
- [ ] Environment variables for secrets
- [ ] Testnet default for new users

---

## 📈 Performance Tips

1. **WebSocket Connection**
   - Reuse single connection per broker
   - Subscribe only to needed channels
   - Unsubscribe on component unmount

2. **State Updates**
   - Use functional updates for nested state
   - Batch updates where possible
   - Debounce frequent updates

3. **API Calls**
   - Cache instrument data
   - Throttle order modifications
   - Use pagination for history

4. **UI Rendering**
   - Lazy load dialogs
   - Virtualize long lists
   - Memoize expensive calculations

---

## 🆘 Quick Troubleshooting

### "Connection stays on Connecting"
→ Check API credentials, firewall, network connectivity

### "Invalid params" on order placement
→ Verify amount is multiple of contract size, check broker rules

### "Strategy not executing trades"
→ Check signal conditions, verify risk limits, check circuit breakers

### "Position not recognized after restart"
→ Verify order labels match, check oco_ref, confirm API permissions

### "Balance showing null"
→ Ensure connected to broker, check API permissions for account read

### "Test order fails"
→ Verify testnet credentials, check symbol exists, validate amount

---

## 📚 Related Documentation

- `TECHNICAL_DOCS.md` - Volledige technische documentatie
- `README_DEV.md` - Development setup & strategy details
- `RISK_ENGINE.md` - Risk engine specificaties
- `BROKER_API.md` - Broker integration details
- `TESTING.md` - Test strategy & coverage
- `DEPLOYMENT.md` - Deployment procedures
- `SECURITY.md` - Security best practices

---

## 🔄 Common Workflows

### Adding a New Strategy

1. Create file in `src/lib/strategies/`
2. Implement Strategy interface
3. Add to `store.ts` in `startStrategy()` switch
4. Add to strategy dropdown in UI
5. Write tests in `src/tests/`
6. Document in `README_DEV.md`

### Adding a New Broker

1. Implement `IBroker` interface in `src/lib/brokers/`
2. Add to `BrokerRegistry.ts`
3. Update `store.ts` broker selection logic
4. Add broker metadata to dropdown
5. Test connection & order placement
6. Document broker-specific quirks

### Debugging Order Issues

1. Check error logs in ErrorDetailsDialog
2. Verify broker rules (tick/lot/min amount)
3. Test with placeTestMicroOrder()
4. Check API response in error.apiResponse
5. Validate amount with validateAndNormalizeAmount()
6. Review Deribit docs for error code

---

**Version:** 1.0  
**Last Updated:** Iteratie 85  
**Status:** Production ready (Deribit), Development (andere brokers)
