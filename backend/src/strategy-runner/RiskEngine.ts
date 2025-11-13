export interface RiskEngineInput {
  equity: number;
  riskMode: 'percent' | 'fixed';
  riskValue: number;
  entryPrice: number;
  stopPrice: number;
  maxLeverage: number;
  minTradeAmount: number;
  tickSize: number;
}

export interface RiskEngineOutput {
  success: boolean;
  quantity: number;
  notional: number;
  leverage: number;
  riskAmount: number;
  reason?: string;
}

export class RiskEngine {
  static calculatePosition(input: RiskEngineInput): RiskEngineOutput {
    const {
      equity,
      riskMode,
      riskValue,
      entryPrice,
      stopPrice,
      maxLeverage,
      minTradeAmount,
      tickSize,
    } = input;
    
    if (equity <= 0) {
      return {
        success: false,
        quantity: 0,
        notional: 0,
        leverage: 0,
        riskAmount: 0,
        reason: 'Invalid equity',
      };
    }
    
    let riskAmount: number;
    
    if (riskMode === 'percent') {
      riskAmount = (equity * riskValue) / 100;
    } else {
      riskAmount = riskValue;
    }
    
    if (riskAmount > equity) {
      riskAmount = equity;
    }
    
    const stopDistance = Math.abs(entryPrice - stopPrice);
    const stopPercent = stopDistance / entryPrice;
    
    if (stopPercent < 0.0001) {
      return {
        success: false,
        quantity: 0,
        notional: 0,
        leverage: 0,
        riskAmount,
        reason: 'Stop loss too close to entry',
      };
    }
    
    const quantity = riskAmount / stopPercent;
    
    if (quantity < minTradeAmount) {
      return {
        success: false,
        quantity: 0,
        notional: 0,
        leverage: 0,
        riskAmount,
        reason: `Quantity ${quantity.toFixed(2)} below minimum ${minTradeAmount}`,
      };
    }
    
    const notional = quantity * entryPrice;
    const leverage = notional / equity;
    
    if (leverage > maxLeverage) {
      const adjustedNotional = equity * maxLeverage;
      const adjustedQuantity = adjustedNotional / entryPrice;
      
      return {
        success: true,
        quantity: Math.floor(adjustedQuantity / tickSize) * tickSize,
        notional: adjustedNotional,
        leverage: maxLeverage,
        riskAmount,
      };
    }
    
    return {
      success: true,
      quantity: Math.floor(quantity / tickSize) * tickSize,
      notional,
      leverage,
      riskAmount,
    };
  }
  
  static calculateStopLoss(
    entryPrice: number,
    side: 'buy' | 'sell',
    stopType: 'percent' | 'atr' | 'fixed',
    stopValue: number,
    atr?: number,
    tickSize: number = 0.5
  ): number {
    let stopPrice: number;
    
    if (stopType === 'percent') {
      if (side === 'buy') {
        stopPrice = entryPrice * (1 - stopValue / 100);
      } else {
        stopPrice = entryPrice * (1 + stopValue / 100);
      }
    } else if (stopType === 'atr' && atr) {
      if (side === 'buy') {
        stopPrice = entryPrice - (atr * stopValue);
      } else {
        stopPrice = entryPrice + (atr * stopValue);
      }
    } else {
      if (side === 'buy') {
        stopPrice = entryPrice - stopValue;
      } else {
        stopPrice = entryPrice + stopValue;
      }
    }
    
    return Math.round(stopPrice / tickSize) * tickSize;
  }
  
  static calculateTakeProfit(
    entryPrice: number,
    stopPrice: number,
    side: 'buy' | 'sell',
    tpType: 'percent' | 'risk_reward' | 'fixed',
    tpValue: number,
    tickSize: number = 0.5
  ): number {
    let takeProfitPrice: number;
    
    if (tpType === 'percent') {
      if (side === 'buy') {
        takeProfitPrice = entryPrice * (1 + tpValue / 100);
      } else {
        takeProfitPrice = entryPrice * (1 - tpValue / 100);
      }
    } else if (tpType === 'risk_reward') {
      const risk = Math.abs(entryPrice - stopPrice);
      const reward = risk * tpValue;
      
      if (side === 'buy') {
        takeProfitPrice = entryPrice + reward;
      } else {
        takeProfitPrice = entryPrice - reward;
      }
    } else {
      if (side === 'buy') {
        takeProfitPrice = entryPrice + tpValue;
      } else {
        takeProfitPrice = entryPrice - tpValue;
      }
    }
    
    return Math.round(takeProfitPrice / tickSize) * tickSize;
  }
}
