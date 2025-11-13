# Strategy Development Guide

**Version:** 1.0  
**Last Updated:** 2025-11-06  
**Status:** ✅ Complete (Iteration 4)
**Target Audience:** Backend Developers, Quant Analysts  
**Prerequisites:** TypeScript, Basic Trading Concepts

---

## Table of Contents

1. [Introduction](#introduction)
2. [IStrategy Interface Overview](#istrategy-interface-overview)
3. [Quick Start: Create Your First Strategy](#quick-start-create-your-first-strategy)
4. [Strategy Templates](#strategy-templates)
5. [Testing Your Strategy](#testing-your-strategy)
6. [Registering Your Strategy](#registering-your-strategy)
7. [Best Practices](#best-practices)
8. [Common Pitfalls](#common-pitfalls)
9. [API Reference](#api-reference)
10. [FAQ](#faq)

---

## Introduction

TradeBaas uses a **flexible strategy architecture** that allows you to create custom trading strategies without modifying core system code. All strategies implement the `IStrategy` interface, ensuring consistent behavior and easy integration.

**What you'll learn:**
- ✅ How to implement the IStrategy interface
- ✅ How to use BaseStrategy utilities
- ✅ How to test your strategy
- ✅ How to register and run your strategy

**What's provided:**
- ✅ Type-safe TypeScript interfaces
- ✅ BaseStrategy with common utilities
- ✅ Risk management (automatic position sizing)
- ✅ OCO order placement (entry + SL + TP)
- ✅ Hot-reload support (development mode)

**Time to build a strategy:** ~5-30 minutes (depending on complexity)

---

## IStrategy Interface Overview

See `backend/src/strategies/IStrategy.ts` for full details. Every strategy must implement 8 methods.

**Key Concepts:**

- **Separation of Concerns:** Analysis → Signal → Risk Calculation
- **Type Safety:** All inputs/outputs typed
- **Testability:** Each method can be tested independently
- **Flexibility:** Implement custom logic for any strategy type

---

## Quick Start: Create Your First Strategy

### Step 1: Create Strategy File

```bash
touch backend/src/strategies/MyCustomStrategy.ts
```

### Step 2: Implement IStrategy

```typescript
import { IStrategy, StrategyMetadata, StrategyConfig, AnalysisResult, TradeSignal, MarketData, Candle } from './IStrategy';
import { BaseStrategy } from './IStrategy';
import { StrategyRegistry } from './StrategyRegistry';

export class MyCustomStrategy extends BaseStrategy implements IStrategy {
  metadata: StrategyMetadata = {
    name: 'My Custom Strategy',
    version: '1.0.0',
    description: 'My first custom trading strategy',
    author: 'Your Name',
    tags: ['custom', 'beginner'],
    parameters: {
      period: { type: 'number', default: 14, min: 5, max: 50 },
    },
  };

  private config!: StrategyConfig;

  async initialize(config: StrategyConfig): Promise<void> {
    this.validateConfig(config);
    this.config = config;
    this.logger.info('Strategy initialized', { config });
  }

  async analyze(marketData: MarketData, candles: Candle[]): Promise<AnalysisResult> {
    // TODO: Implement your analysis logic
    return {
      indicators: {},
      state: {},
      timestamp: Date.now(),
    };
  }

  async generateSignal(analysis: AnalysisResult, marketData: MarketData): Promise<TradeSignal> {
    // TODO: Implement your signal generation logic
    return {
      action: 'none',
      confidence: 0,
      reason: 'No signal detected',
    };
  }

  calculateStopLoss(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number {
    const slPercent = 2; // 2% stop-loss
    return side === 'buy' ? entryPrice * (1 - slPercent / 100) : entryPrice * (1 + slPercent / 100);
  }

  calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell', marketData: MarketData): number {
    const tpPercent = 4; // 4% take-profit (2:1 R:R)
    return side === 'buy' ? entryPrice * (1 + tpPercent / 100) : entryPrice * (1 - tpPercent / 100);
  }

  validateConfig(config: StrategyConfig): void {
    if (config.period < 5) {
      throw new Error('period must be at least 5');
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info('Strategy cleanup');
  }
}

// Auto-register on import
StrategyRegistry.getInstance().register(new MyCustomStrategy());
```

---

## Strategy Templates

See the complete examples in:
- `backend/src/strategies/SimpleMovingAverageCrossStrategy.ts` - Indicator-based
- Documentation includes SMC and Price Action templates (see ADR-0003)

---

## Testing Your Strategy

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyCustomStrategy } from './MyCustomStrategy';

describe('MyCustomStrategy', () => {
  let strategy: MyCustomStrategy;

  beforeEach(() => {
    strategy = new MyCustomStrategy();
  });

  it('should initialize with valid config', async () => {
    await strategy.initialize({ period: 14 });
    expect(strategy).toBeDefined();
  });

  it('should calculate stop-loss correctly', () => {
    const entryPrice = 50000;
    const sl = strategy.calculateStopLoss(entryPrice, 'buy', {} as MarketData);
    expect(sl).toBeLessThan(entryPrice);
  });
});
```

---

## Registering Your Strategy

```typescript
// Auto-register on import
StrategyRegistry.getInstance().register(new MyCustomStrategy());
```

---

## Best Practices

1. **Use BaseStrategy Utilities** - Provides logger and common helpers
2. **Validate Configuration** - Always validate user input
3. **Log Important Events** - Use this.logger.info/warn/error
4. **Handle Edge Cases** - Check for insufficient data
5. **Keep analyze() and generateSignal() Separate** - Clear separation of concerns
6. **Document Complex Logic** - Add comments for future maintainers

---

## Common Pitfalls

❌ **Don't mutate input arrays** - Create copies instead
❌ **Don't hardcode values** - Use configuration
❌ **Don't forget await** - All strategy methods are async
❌ **Don't skip validation** - Validate all inputs

---

## API Reference

See `backend/src/strategies/IStrategy.ts` for complete type definitions.

Key types:
- `MarketData` - Current market price and volume
- `Candle` - OHLCV data
- `AnalysisResult` - Indicators and state
- `TradeSignal` - Trade action, confidence, reason

---

## FAQ

**Q: Can I run multiple strategies at once?**  
A: Not in MVP. Single strategy limit enforced. Multi-strategy support planned for Iteration 6.

**Q: How do I test on testnet?**  
A: Set DERIBIT_ENV=test and start your strategy. Monitor logs for signals.

**Q: Can I use external indicators (TA-Lib)?**  
A: Yes! Install TA-Lib and use in your analyze() method.

**Q: How do I debug my strategy?**  
A: Use this.logger.debug() and check logs with journalctl.

---

**Next Steps:**
1. ✅ Create your first strategy (use Quick Start template)
2. ✅ Write unit tests
3. ✅ Test on testnet
4. ✅ Monitor performance
5. ✅ Iterate and improve

**Need Help?**
- Read ADR-0003 for architecture details
- Check SimpleMovingAverageCrossStrategy.ts for full example
- Review PositionSizer.test.ts for testing examples

**Happy Trading! 🚀**
