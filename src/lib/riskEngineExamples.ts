import { 
  calculatePosition, 
  createBrokerRules, 
  buildBracket,
  type BrokerRules,
  type RiskEngineInput 
} from './riskEngine';

export const BROKER_RULES: Record<string, BrokerRules> = {
  deribit: createBrokerRules(50, 0.5, 10, 10, 10),
  binance: createBrokerRules(125, 0.1, 0.001, 10, 1),
  bybit: createBrokerRules(100, 0.5, 0.001, 10, 1),
  okx: createBrokerRules(125, 0.1, 0.001, 10, 1),
  kraken: createBrokerRules(5, 0.5, 0.001, 10, 1),
  bitmex: createBrokerRules(100, 0.5, 1, 1, 1),
  mexc: createBrokerRules(200, 0.01, 0.001, 10, 1),
  coinbase: createBrokerRules(5, 0.01, 0.001, 10, 1),
  kucoin: createBrokerRules(100, 0.5, 0.001, 10, 1),
  gateio: createBrokerRules(100, 0.1, 0.001, 10, 1),
  huobi: createBrokerRules(125, 0.1, 0.001, 10, 1),
  phemex: createBrokerRules(100, 0.5, 0.001, 10, 1),
  bitget: createBrokerRules(125, 0.1, 0.001, 10, 1),
  bitstamp: createBrokerRules(3, 0.01, 0.001, 10, 1),
  bitfinex: createBrokerRules(10, 0.1, 0.001, 10, 1),
};

export function exampleDeribitCalculation() {
  const equity = 10000;
  const entryPrice = 50000;
  const stopPrice = 49000;
  
  const input: RiskEngineInput = {
    equity,
    riskMode: 'percent',
    riskValue: 2,
    entryPrice,
    stopPrice,
    brokerRules: BROKER_RULES.deribit,
  };
  
  const result = calculatePosition(input);
  
  console.log('=== Deribit Example ===');
  console.log('Equity:', equity, 'USDC');
  console.log('Entry:', entryPrice);
  console.log('Stop:', stopPrice);
  console.log('Risk:', '2% of equity');
  
  if (result.success) {
    console.log('✓ Position size:', result.quantity, 'USD');
    console.log('✓ Notional:', result.notional.toFixed(2), 'USD');
    console.log('✓ Leverage:', result.effectiveLeverage.toFixed(2) + 'x');
    if (result.warnings.length > 0) {
      console.log('⚠ Warnings:', result.warnings.join(', '));
    }
  } else {
    console.log('✗ Error:', result.reason);
  }
  
  return result;
}

export function exampleBinanceHighLeverage() {
  const equity = 1000;
  const entryPrice = 100000;
  const stopPrice = 99000;
  
  const input: RiskEngineInput = {
    equity,
    riskMode: 'percent',
    riskValue: 10,
    entryPrice,
    stopPrice,
    brokerRules: BROKER_RULES.binance,
  };
  
  const result = calculatePosition(input);
  
  console.log('\n=== Binance High Leverage Example ===');
  console.log('Equity:', equity, 'USDC');
  console.log('Entry:', entryPrice);
  console.log('Stop:', stopPrice);
  console.log('Risk:', '10% of equity');
  
  if (result.success) {
    console.log('✓ Position size:', result.quantity, 'BTC');
    console.log('✓ Notional:', result.notional.toFixed(2), 'USD');
    console.log('✓ Leverage:', result.effectiveLeverage.toFixed(2) + 'x');
    if (result.warnings.length > 0) {
      console.log('⚠ Warnings:', result.warnings.join(', '));
    }
  } else {
    console.log('✗ Error:', result.reason);
  }
  
  return result;
}

export function exampleKrakenConservative() {
  const equity = 10000;
  const entryPrice = 50000;
  const stopPrice = 48000;
  
  const input: RiskEngineInput = {
    equity,
    riskMode: 'percent',
    riskValue: 5,
    entryPrice,
    stopPrice,
    brokerRules: BROKER_RULES.kraken,
  };
  
  const result = calculatePosition(input);
  
  console.log('\n=== Kraken Conservative Example ===');
  console.log('Equity:', equity, 'USDC');
  console.log('Entry:', entryPrice);
  console.log('Stop:', stopPrice);
  console.log('Risk:', '5% of equity');
  console.log('Max Leverage:', BROKER_RULES.kraken.maxLeverage + 'x (Kraken limit)');
  
  if (result.success) {
    console.log('✓ Position size:', result.quantity, 'BTC');
    console.log('✓ Notional:', result.notional.toFixed(2), 'USD');
    console.log('✓ Leverage:', result.effectiveLeverage.toFixed(2) + 'x');
    if (result.warnings.length > 0) {
      console.log('⚠ Warnings:', result.warnings.join(', '));
    }
  } else {
    console.log('✗ Error:', result.reason);
  }
  
  return result;
}

export function exampleFixedRiskMode() {
  const equity = 5000;
  const entryPrice = 50000;
  const stopPrice = 49500;
  
  const input: RiskEngineInput = {
    equity,
    riskMode: 'fixed',
    riskValue: 100,
    entryPrice,
    stopPrice,
    brokerRules: BROKER_RULES.deribit,
  };
  
  const result = calculatePosition(input);
  
  console.log('\n=== Fixed Risk Mode Example ===');
  console.log('Equity:', equity, 'USDC');
  console.log('Entry:', entryPrice);
  console.log('Stop:', stopPrice);
  console.log('Risk:', '100 USDC (fixed)');
  
  if (result.success) {
    console.log('✓ Position size:', result.quantity, 'USD');
    console.log('✓ Notional:', result.notional.toFixed(2), 'USD');
    console.log('✓ Leverage:', result.effectiveLeverage.toFixed(2) + 'x');
    if (result.warnings.length > 0) {
      console.log('⚠ Warnings:', result.warnings.join(', '));
    }
  } else {
    console.log('✗ Error:', result.reason);
  }
  
  return result;
}

export function exampleBracketOrders() {
  const entryPrice = 50000;
  const stopPrice = 49000;
  const riskRewardRatio = 2;
  const tickSize = 0.5;
  
  const bracket = buildBracket('buy', entryPrice, stopPrice, riskRewardRatio, tickSize);
  
  console.log('\n=== Bracket Order Example ===');
  console.log('Entry:', entryPrice);
  console.log('Stop Loss:', bracket.stopLoss);
  console.log('Take Profit:', bracket.takeProfit);
  console.log('Risk/Reward Ratio:', riskRewardRatio + ':1');
  console.log('Distance:', entryPrice - stopPrice);
  console.log('Target Distance:', bracket.takeProfit - entryPrice);
  
  return bracket;
}

export function compareAllBrokers() {
  const equity = 10000;
  const entryPrice = 50000;
  const stopPrice = 49000;
  const riskPercent = 2;
  
  console.log('\n=== Broker Comparison ===');
  console.log('Equity:', equity, 'USDC');
  console.log('Entry:', entryPrice);
  console.log('Stop:', stopPrice);
  console.log('Risk:', riskPercent + '% of equity');
  console.log('');
  
  const results: Array<{ broker: string; result: ReturnType<typeof calculatePosition> }> = [];
  
  for (const [brokerName, brokerRules] of Object.entries(BROKER_RULES)) {
    const input: RiskEngineInput = {
      equity,
      riskMode: 'percent',
      riskValue: riskPercent,
      entryPrice,
      stopPrice,
      brokerRules,
    };
    
    const result = calculatePosition(input);
    results.push({ broker: brokerName, result });
    
    console.log(`${brokerName.toUpperCase()}:`);
    console.log(`  Max Leverage: ${brokerRules.maxLeverage}x`);
    if (result.success) {
      console.log(`  ✓ Quantity: ${result.quantity}`);
      console.log(`  ✓ Leverage: ${result.effectiveLeverage.toFixed(2)}x`);
      if (result.warnings.length > 0) {
        console.log(`  ⚠ ${result.warnings[0]}`);
      }
    } else {
      console.log(`  ✗ ${result.reason}`);
    }
    console.log('');
  }
  
  return results;
}

export function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Risk Engine - Broker-Agnostic Examples            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  exampleDeribitCalculation();
  exampleBinanceHighLeverage();
  exampleKrakenConservative();
  exampleFixedRiskMode();
  exampleBracketOrders();
  compareAllBrokers();
  
  console.log('\n✓ All examples completed\n');
}
