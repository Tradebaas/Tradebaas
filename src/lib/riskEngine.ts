import { roundToMultiple } from './utils';

export type RiskMode = 'percent' | 'fixed';

export type OrderSide = 'buy' | 'sell';

export interface BrokerRules {
  maxLeverage: number;
  tickSize: number;
  lotSize: number;
  minTradeAmount: number;
  contractSize: number;
}

export interface InstrumentMeta {
  tick_size: number;
  min_trade_amount: number;
  max_leverage: number;
  contract_size: number;
}

export interface RiskEngineInput {
  equity: number;
  riskMode: RiskMode;
  riskValue: number;
  entryPrice: number;
  stopPrice: number;
  brokerRules: BrokerRules;
}

export interface RiskEngineOutput {
  success: true;
  quantity: number;
  notional: number;
  effectiveLeverage: number;
  warnings: string[];
}

export interface RiskEngineError {
  success: false;
  reason: string;
  details?: Record<string, unknown>;
}

export type RiskEngineResult = RiskEngineOutput | RiskEngineError;

export interface BracketPrices {
  stopLoss: number;
  takeProfit: number;
}

export function instrumentMetaToBrokerRules(instrumentMeta: InstrumentMeta): BrokerRules {
  return {
    maxLeverage: instrumentMeta.max_leverage,
    tickSize: instrumentMeta.tick_size,
    lotSize: instrumentMeta.contract_size,
    minTradeAmount: instrumentMeta.min_trade_amount,
    contractSize: instrumentMeta.contract_size,
  };
}

export function createBrokerRules(
  maxLeverage: number,
  tickSize: number,
  lotSize: number,
  minTradeAmount: number,
  contractSize: number
): BrokerRules {
  return {
    maxLeverage,
    tickSize,
    lotSize,
    minTradeAmount,
    contractSize,
  };
}

function roundToTickSize(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

function roundToLotSize(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  return roundToMultiple(quantity, lotSize);
}

export function calculatePosition(input: RiskEngineInput): RiskEngineResult {
  const { equity, riskMode, riskValue, entryPrice, stopPrice, brokerRules } = input;
  const { tickSize, contractSize, minTradeAmount, maxLeverage } = brokerRules;
  
  const warnings: string[] = [];
  
  if (equity <= 0) {
    return {
      success: false,
      reason: 'Equity moet groter zijn dan nul',
      details: { equity },
    };
  }
  
  if (entryPrice <= 0) {
    return {
      success: false,
      reason: 'Entry prijs moet groter zijn dan nul',
      details: { entryPrice },
    };
  }
  
  if (stopPrice <= 0) {
    return {
      success: false,
      reason: 'Stop prijs moet groter zijn dan nul',
      details: { stopPrice },
    };
  }
  
  if (riskValue <= 0) {
    return {
      success: false,
      reason: 'Risico waarde moet groter zijn dan nul',
      details: { riskValue },
    };
  }
  
  if (minTradeAmount <= 0) {
    return {
      success: false,
      reason: 'Minimale trade hoeveelheid moet groter zijn dan nul',
      details: { minTradeAmount },
    };
  }
  
  if (contractSize <= 0) {
    return {
      success: false,
      reason: 'Contract size moet groter zijn dan nul',
      details: { contractSize },
    };
  }
  
  const distance = Math.abs(entryPrice - stopPrice);
  
  if (distance === 0) {
    return {
      success: false,
      reason: 'Stop prijs kan niet gelijk zijn aan entry prijs',
      details: { entryPrice, stopPrice },
    };
  }
  
  let riskAmount: number;
  
  if (riskMode === 'percent') {
    if (riskValue < 0 || riskValue > 50) {
      return {
        success: false,
        reason: 'Risico percentage moet tussen 0 en 50 liggen',
        details: { riskValue },
      };
    }
    
    riskAmount = equity * (riskValue / 100);
  } else {
    const maxFixedRisk = equity * 0.5;
    
    if (riskValue > maxFixedRisk) {
      return {
        success: false,
        reason: `Vast risico bedrag mag niet meer zijn dan 50% van equity (max ${maxFixedRisk.toFixed(1)} USDC)`,
        details: { riskValue, maxFixedRisk, equity },
      };
    }
    
    riskAmount = riskValue;
  }
  
  let quantity = riskAmount / distance;
  
  const notionalBeforeLeverage = quantity * entryPrice;
  const leverageBeforeCap = notionalBeforeLeverage / equity;
  
  if (leverageBeforeCap > maxLeverage) {
    const maxNotional = equity * maxLeverage;
    quantity = maxNotional / entryPrice;
    warnings.push(`Leverage begrensd tot ${maxLeverage}x (broker limiet)`);
  }
  
  const roundedQuantity = roundToLotSize(quantity, contractSize);
  
  if (roundedQuantity < minTradeAmount) {
    return {
      success: false,
      reason: 'Positiegrootte onder minimale trade hoeveelheid na afronding',
      details: {
        calculatedQuantity: quantity,
        roundedQuantity,
        minTradeAmount,
        contractSize,
        brokerRules,
      },
    };
  }
  
  const finalNotional = roundedQuantity * entryPrice;
  const finalLeverage = finalNotional / equity;
  
  if (finalLeverage > maxLeverage) {
    return {
      success: false,
      reason: 'Positie overschrijdt maximale leverage na afronding',
      details: {
        finalLeverage,
        maxLeverage,
        brokerRules,
      },
    };
  }
  
  if (finalLeverage < 1 && riskMode === 'percent' && riskValue > 5) {
    warnings.push('Lage leverage kan wijzen op conservatieve positiegrootte');
  }
  
  if (finalLeverage > 10) {
    warnings.push(`Hoge leverage gedetecteerd: ${finalLeverage.toFixed(1)}x`);
  }
  
  return {
    success: true,
    quantity: roundedQuantity,
    notional: finalNotional,
    effectiveLeverage: finalLeverage,
    warnings,
  };
}

export function buildBracket(
  orderSide: OrderSide,
  entryPrice: number,
  stopPrice: number,
  riskRewardRatio: number,
  tickSize: number
): BracketPrices {
  if (entryPrice <= 0 || stopPrice <= 0 || riskRewardRatio <= 0) {
    throw new Error('Ongeldige bracket parameters: prijzen en risk/reward moeten positief zijn');
  }
  
  const distance = Math.abs(entryPrice - stopPrice);
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (orderSide === 'buy') {
    if (stopPrice >= entryPrice) {
      throw new Error('Voor buy orders moet stop prijs onder entry prijs liggen');
    }
    
    stopLoss = roundToTickSize(stopPrice, tickSize);
    takeProfit = roundToTickSize(entryPrice + (distance * riskRewardRatio), tickSize);
  } else {
    if (stopPrice <= entryPrice) {
      throw new Error('Voor sell orders moet stop prijs boven entry prijs liggen');
    }
    
    stopLoss = roundToTickSize(stopPrice, tickSize);
    takeProfit = roundToTickSize(entryPrice - (distance * riskRewardRatio), tickSize);
  }
  
  if (takeProfit <= 0) {
    throw new Error('Take profit prijs moet positief zijn');
  }
  
  return {
    stopLoss,
    takeProfit,
  };
}
