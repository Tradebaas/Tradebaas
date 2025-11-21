/**
 * Cost Analysis for Deribit Futures Trading
 * 
 * Analyzes costs for different exit scenarios:
 * - Market close (taker fee)
 * - Take Profit hit (maker fee)
 * - Stop Loss hit (taker fee)
 * 
 * Based on Deribit fee structure and leverage implications
 */

export interface CostBreakdown {
  scenario: 'market_close' | 'tp_hit' | 'sl_hit';
  tradingFee: number;
  tradingFeePercent: number;
  settlementFee: number;
  totalCost: number;
  totalCostPercent: number;
  description: string;
  details: {
    notionalValue: number;
    feeRate: number;
    feeType: 'maker' | 'taker';
    leverage: number;
    positionSize: number;
  };
}

export interface TradeCostAnalysis {
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  leverage: number;
  instrument: string;
  scenarios: {
    marketClose: CostBreakdown;
    takeProfitHit: CostBreakdown;
    stopLossHit: CostBreakdown;
  };
  summary: {
    bestCase: CostBreakdown;
    worstCase: CostBreakdown;
    averageCost: number;
  };
}

/**
 * Deribit fee structure (USDC perpetuals)
 * Source: https://www.deribit.com/pages/information/fees
 */
const DERIBIT_FEES = {
  // Trading fees
  maker: 0.0002, // 0.02% (you add liquidity)
  taker: 0.0005, // 0.05% (you remove liquidity)
  
  // Settlement fees (applies on final settlement, not on regular closes)
  settlement: 0.00015, // 0.015%
  
  // Fee tiers exist but we use base tier for conservative estimates
};

/**
 * Calculate trading costs for different exit scenarios
 */
export function calculateTradingCosts(params: {
  entryPrice: number;
  exitPrice: number;
  positionSize: number; // in USD notional
  leverage: number;
  instrument?: string;
}): TradeCostAnalysis {
  const {
    entryPrice,
    exitPrice,
    positionSize,
    leverage,
    instrument = 'BTC_USDC-PERPETUAL',
  } = params;

  // Calculate notional value
  const notionalValue = positionSize;

  // Scenario 1: Market Close (Taker Fee)
  const marketClose = calculateScenarioCost({
    notionalValue,
    feeRate: DERIBIT_FEES.taker,
    feeType: 'taker',
    scenario: 'market_close',
    leverage,
    positionSize,
    description: 'Market close gebruikt een market order, wat een taker fee triggert',
  });

  // Scenario 2: Take Profit Hit (Maker Fee)
  const takeProfitHit = calculateScenarioCost({
    notionalValue,
    feeRate: DERIBIT_FEES.maker,
    feeType: 'maker',
    scenario: 'tp_hit',
    leverage,
    positionSize,
    description: 'Take Profit limit order wordt geraakt, wat een maker fee triggert (je voegt liquiditeit toe)',
  });

  // Scenario 3: Stop Loss Hit (Taker Fee)
  const stopLossHit = calculateScenarioCost({
    notionalValue,
    feeRate: DERIBIT_FEES.taker,
    feeType: 'taker',
    scenario: 'sl_hit',
    leverage,
    positionSize,
    description: 'Stop Loss wordt getriggerd en sluit met een market order (taker fee)',
  });

  // Determine best and worst case
  const allScenarios = [marketClose, takeProfitHit, stopLossHit];
  const bestCase = allScenarios.reduce((best, current) =>
    current.totalCost < best.totalCost ? current : best
  );
  const worstCase = allScenarios.reduce((worst, current) =>
    current.totalCost > worst.totalCost ? current : worst
  );
  const averageCost =
    allScenarios.reduce((sum, s) => sum + s.totalCost, 0) / allScenarios.length;

  return {
    entryPrice,
    exitPrice,
    positionSize,
    leverage,
    instrument,
    scenarios: {
      marketClose,
      takeProfitHit,
      stopLossHit,
    },
    summary: {
      bestCase,
      worstCase,
      averageCost,
    },
  };
}

function calculateScenarioCost(params: {
  notionalValue: number;
  feeRate: number;
  feeType: 'maker' | 'taker';
  scenario: 'market_close' | 'tp_hit' | 'sl_hit';
  leverage: number;
  positionSize: number;
  description: string;
}): CostBreakdown {
  const { notionalValue, feeRate, feeType, scenario, leverage, positionSize, description } =
    params;

  // Calculate trading fee
  const tradingFee = notionalValue * feeRate;
  const tradingFeePercent = feeRate * 100;

  // Settlement fee (typically only on actual settlement, not regular closes)
  // For USDC perps, this is usually 0 for regular closes
  const settlementFee = 0;

  // Total cost
  const totalCost = tradingFee + settlementFee;
  const totalCostPercent = (totalCost / notionalValue) * 100;

  return {
    scenario,
    tradingFee,
    tradingFeePercent,
    settlementFee,
    totalCost,
    totalCostPercent,
    description,
    details: {
      notionalValue,
      feeRate,
      feeType,
      leverage,
      positionSize,
    },
  };
}

/**
 * Calculate entry + exit costs for a complete trade
 */
export function calculateCompleteTradeCosts(params: {
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  leverage: number;
  instrument?: string;
}): {
  entryCost: number;
  exitCostAnalysis: TradeCostAnalysis;
  totalCostRange: {
    best: number; // Entry (taker) + Exit (maker/TP)
    worst: number; // Entry (taker) + Exit (taker/market or SL)
    typical: number; // Entry (taker) + Exit (average)
  };
  impactOnPnL: {
    best: string;
    worst: string;
    typical: string;
  };
} {
  const { positionSize } = params;

  // Entry cost (always taker when using market orders)
  const entryCost = positionSize * DERIBIT_FEES.taker;

  // Exit cost analysis
  const exitCostAnalysis = calculateTradingCosts(params);

  // Calculate total costs
  const totalCostBest = entryCost + exitCostAnalysis.scenarios.takeProfitHit.totalCost;
  const totalCostWorst = entryCost + exitCostAnalysis.scenarios.stopLossHit.totalCost;
  const totalCostTypical = entryCost + exitCostAnalysis.summary.averageCost;

  return {
    entryCost,
    exitCostAnalysis,
    totalCostRange: {
      best: totalCostBest,
      worst: totalCostWorst,
      typical: totalCostTypical,
    },
    impactOnPnL: {
      best: `${((totalCostBest / positionSize) * 100).toFixed(4)}%`,
      worst: `${((totalCostWorst / positionSize) * 100).toFixed(4)}%`,
      typical: `${((totalCostTypical / positionSize) * 100).toFixed(4)}%`,
    },
  };
}

/**
 * Format cost breakdown for display
 */
export function formatCostBreakdown(breakdown: CostBreakdown): string {
  return `
${breakdown.scenario.replace(/_/g, ' ').toUpperCase()}:
  Fee Type: ${breakdown.details.feeType}
  Trading Fee: $${breakdown.tradingFee.toFixed(2)} (${breakdown.tradingFeePercent.toFixed(4)}%)
  Settlement Fee: $${breakdown.settlementFee.toFixed(2)}
  Total Cost: $${breakdown.totalCost.toFixed(2)} (${breakdown.totalCostPercent.toFixed(4)}%)
  
  Details:
  - Notional: $${breakdown.details.notionalValue.toFixed(2)}
  - Leverage: ${breakdown.details.leverage}x
  - ${breakdown.description}
  `.trim();
}

/**
 * Get cost analysis summary for UI display
 */
export function getCostAnalysisSummary(analysis: TradeCostAnalysis): {
  bestScenario: string;
  bestCost: string;
  worstScenario: string;
  worstCost: string;
  costDifference: string;
  leverageImpact: string;
} {
  const best = analysis.summary.bestCase;
  const worst = analysis.summary.worstCase;
  const difference = worst.totalCost - best.totalCost;
  const differencePercent = ((difference / best.totalCost) * 100).toFixed(2);

  return {
    bestScenario: best.scenario.replace(/_/g, ' '),
    bestCost: `$${best.totalCost.toFixed(2)} (${best.totalCostPercent.toFixed(4)}%)`,
    worstScenario: worst.scenario.replace(/_/g, ' '),
    worstCost: `$${worst.totalCost.toFixed(2)} (${worst.totalCostPercent.toFixed(4)}%)`,
    costDifference: `$${difference.toFixed(2)} (${differencePercent}% hoger)`,
    leverageImpact: `Met ${analysis.leverage}x leverage betaal je dezelfde fee percentages, maar op een grotere notional value`,
  };
}
