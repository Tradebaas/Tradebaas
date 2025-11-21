/**
 * PositionSizer.ts
 * 
 * Purpose: Calculate optimal position size based on fixed percentage risk
 * Formula: quantity = (balance × riskPercent) / |entryPrice - stopLossPrice|
 * 
 * Key Features:
 * - Exact risk management (5% default)
 * - Leverage optimization (prefer lower leverage)
 * - Lot size rounding (Deribit: $1 USD increments)
 * - Min/max position validation
 * - Multi-currency support (BTC, ETH, USDC)
 * 
 * Part of: Iteration 4 - Risk Engine
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PositionSizeInput {
  balance: number;           // Available balance in base currency (e.g., BTC)
  balanceCurrency: string;   // Currency of balance (BTC, ETH, USDC)
  entryPrice: number;        // Entry price in quote currency (USD)
  stopLossPrice: number;     // Stop-loss price in quote currency (USD)
  riskPercent: number;       // Risk percentage (e.g., 5 = 5%)
  currentPrice: number;      // Current market price (for conversions)
  instrument: string;        // Trading pair (e.g., BTC-PERPETUAL)
  minOrderSize?: number;     // Minimum order size (default: 10 USD)
  maxOrderSize?: number;     // Maximum order size (default: 1,000,000 USD)
  lotSize?: number;          // Lot size increment (default: 1 USD)
  maxLeverage?: number;      // Maximum allowed leverage (default: 50x)
  warnLeverage?: number;     // Leverage warning threshold (default: 10x)
}

export interface PositionSizeOutput {
  quantity: number;          // Calculated position size in USD
  leverage: number;          // Required leverage (1x - 50x)
  riskAmount: number;        // Risk amount in base currency
  riskAmountUSD: number;     // Risk amount in USD
  marginRequired: number;    // Margin required in base currency
  marginRequiredUSD: number; // Margin required in USD
  notionalValue: number;     // Total position value in USD
  warnings: string[];        // Array of warning messages
  details: {
    rawQuantity: number;     // Before rounding
    roundedQuantity: number; // After rounding
    stopLossDistance: number;// |entryPrice - stopLossPrice|
    stopLossPercent: number; // Stop-loss distance as %
  };
}

export class PositionSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PositionSizeError';
  }
}

export class InsufficientBalanceError extends PositionSizeError {
  constructor(required: number, available: number, currency: string) {
    super(`Insufficient balance: required ${required.toFixed(8)} ${currency}, available ${available.toFixed(8)} ${currency}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class LeverageExceededError extends PositionSizeError {
  constructor(calculated: number, max: number) {
    super(`Leverage exceeded: ${calculated.toFixed(2)}x > ${max}x max`);
    this.name = 'LeverageExceededError';
  }
}

export class InvalidStopLossError extends PositionSizeError {
  constructor(reason: string) {
    super(`Invalid stop-loss: ${reason}`);
    this.name = 'InvalidStopLossError';
  }
}

// ============================================================================
// Position Sizer Class
// ============================================================================

export class PositionSizer {
  // Default configuration
  private static readonly DEFAULT_MIN_ORDER_SIZE = 10;        // $10 USD
  private static readonly DEFAULT_MAX_ORDER_SIZE = 1_000_000; // $1M USD
  private static readonly DEFAULT_LOT_SIZE = 1;               // $1 USD
  private static readonly DEFAULT_MAX_LEVERAGE = 50;          // 50x
  private static readonly DEFAULT_WARN_LEVERAGE = 10;         // 10x
  private static readonly PRECISION = 8;                      // Decimal places

  /**
   * Calculate optimal position size based on fixed percentage risk
   * 
   * Formula: quantity = (balance × riskPercent) / |entryPrice - stopLossPrice|
   * 
   * @param input - Position sizing parameters
   * @returns Position size with leverage and risk details
   */
  public static calculatePositionSize(input: PositionSizeInput): PositionSizeOutput {
    // Validate input
    this.validateInput(input);

    // Extract parameters with defaults
    const {
      balance,
      balanceCurrency,
      entryPrice,
      stopLossPrice,
      riskPercent,
      currentPrice,
      instrument,
      minOrderSize = this.DEFAULT_MIN_ORDER_SIZE,
      maxOrderSize = this.DEFAULT_MAX_ORDER_SIZE,
      lotSize = this.DEFAULT_LOT_SIZE,
      maxLeverage = this.DEFAULT_MAX_LEVERAGE,
      warnLeverage = this.DEFAULT_WARN_LEVERAGE,
    } = input;

    const warnings: string[] = [];

    // Step 1: Calculate stop-loss distance
    const stopLossDistance = Math.abs(entryPrice - stopLossPrice);
    const stopLossPercent = (stopLossDistance / entryPrice) * 100;

    if (stopLossDistance === 0) {
      throw new InvalidStopLossError('Stop-loss price equals entry price');
    }

    if (stopLossPercent > 50) {
      warnings.push(`Large stop-loss distance: ${stopLossPercent.toFixed(2)}% (consider tighter SL)`);
    }

    // Step 2: Calculate risk amount in base currency
    const riskAmount = balance * (riskPercent / 100);

    // Step 3: Convert risk amount to USD
    const riskAmountUSD = this.convertToUSD(riskAmount, balanceCurrency, currentPrice);

    // Step 4: Calculate raw quantity (in USD for Deribit perpetuals)
    // For Deribit perpetuals, quantity is in USD
    // Loss per unit = |entryPrice - stopLossPrice| / entryPrice (as fraction of entry)
    // Number of units needed = riskAmountUSD / (stopLossDistance / entryPrice)
    // Simplified: quantity = (riskAmountUSD * entryPrice) / stopLossDistance
    const rawQuantity = (riskAmountUSD * entryPrice) / stopLossDistance;

    // Step 5: Round to lot size
    const roundedQuantity = this.roundToLotSize(rawQuantity, lotSize);

    // Step 6: Validate against min/max order size
    if (roundedQuantity < minOrderSize) {
      throw new PositionSizeError(
        `Position size ${roundedQuantity.toFixed(2)} USD < minimum ${minOrderSize} USD (increase risk% or balance)`
      );
    }

    if (roundedQuantity > maxOrderSize) {
      throw new PositionSizeError(
        `Position size ${roundedQuantity.toFixed(2)} USD > maximum ${maxOrderSize} USD (decrease risk% or use multiple accounts)`
      );
    }

    // Step 7: Calculate notional value
    const notionalValue = roundedQuantity; // For Deribit, quantity is already in USD

    // Step 8: Convert balance to USD
    const balanceUSD = this.convertToUSD(balance, balanceCurrency, currentPrice);

    // Step 9: Calculate leverage
    // Formula: leverage = notionalValue / balanceUSD
    const leverage = notionalValue / balanceUSD;

    // Step 10: Validate leverage
    if (leverage > maxLeverage) {
      throw new LeverageExceededError(leverage, maxLeverage);
    }

    if (leverage > warnLeverage) {
      warnings.push(`High leverage: ${leverage.toFixed(2)}x (>${warnLeverage}x threshold)`);
    }

    // Step 11: Calculate margin required
    // Formula: margin = notionalValue / leverage
    const marginRequiredUSD = notionalValue / leverage;
    const marginRequired = this.convertFromUSD(marginRequiredUSD, balanceCurrency, currentPrice);

    // Step 12: Validate sufficient balance
    if (marginRequired > balance) {
      throw new InsufficientBalanceError(marginRequired, balance, balanceCurrency);
    }

    // Step 13: Log details for debugging
    console.log(`[PositionSizer] Calculated position size:`);
    console.log(`  Balance: ${balance.toFixed(8)} ${balanceCurrency} (${balanceUSD.toFixed(2)} USD)`);
    console.log(`  Risk: ${riskPercent}% = ${riskAmount.toFixed(8)} ${balanceCurrency} (${riskAmountUSD.toFixed(2)} USD)`);
    console.log(`  Entry: ${entryPrice} USD, SL: ${stopLossPrice} USD`);
    console.log(`  SL Distance: ${stopLossDistance.toFixed(2)} USD (${stopLossPercent.toFixed(2)}%)`);
    console.log(`  Raw Quantity: ${rawQuantity.toFixed(2)} USD`);
    console.log(`  Rounded Quantity: ${roundedQuantity.toFixed(2)} USD (lot size: ${lotSize})`);
    console.log(`  Notional Value: ${notionalValue.toFixed(2)} USD`);
    console.log(`  Leverage: ${leverage.toFixed(2)}x`);
    console.log(`  Margin Required: ${marginRequired.toFixed(8)} ${balanceCurrency} (${marginRequiredUSD.toFixed(2)} USD)`);
    if (warnings.length > 0) {
      console.warn(`[PositionSizer] Warnings:`, warnings);
    }

    // Return result
    return {
      quantity: roundedQuantity,
      leverage: this.round(leverage, 2),
      riskAmount: this.round(riskAmount, this.PRECISION),
      riskAmountUSD: this.round(riskAmountUSD, 2),
      marginRequired: this.round(marginRequired, this.PRECISION),
      marginRequiredUSD: this.round(marginRequiredUSD, 2),
      notionalValue: this.round(notionalValue, 2),
      warnings,
      details: {
        rawQuantity: this.round(rawQuantity, 2),
        roundedQuantity: this.round(roundedQuantity, 2),
        stopLossDistance: this.round(stopLossDistance, 2),
        stopLossPercent: this.round(stopLossPercent, 2),
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Validate input parameters
   */
  private static validateInput(input: PositionSizeInput): void {
    const {
      balance,
      balanceCurrency,
      entryPrice,
      stopLossPrice,
      riskPercent,
      currentPrice,
    } = input;

    if (balance <= 0) {
      throw new PositionSizeError(`Invalid balance: ${balance} (must be > 0)`);
    }

    if (!['BTC', 'ETH', 'USDC', 'USD'].includes(balanceCurrency)) {
      throw new PositionSizeError(`Unsupported currency: ${balanceCurrency} (must be BTC, ETH, USDC, or USD)`);
    }

    if (entryPrice <= 0) {
      throw new PositionSizeError(`Invalid entry price: ${entryPrice} (must be > 0)`);
    }

    if (stopLossPrice <= 0) {
      throw new PositionSizeError(`Invalid stop-loss price: ${stopLossPrice} (must be > 0)`);
    }

    if (riskPercent <= 0 || riskPercent > 100) {
      throw new PositionSizeError(`Invalid risk percent: ${riskPercent} (must be 0 < risk ≤ 100)`);
    }

    if (currentPrice <= 0) {
      throw new PositionSizeError(`Invalid current price: ${currentPrice} (must be > 0)`);
    }
  }

  /**
   * Convert amount from base currency to USD
   */
  private static convertToUSD(
    amount: number,
    currency: string,
    currentPrice: number
  ): number {
    switch (currency) {
      case 'BTC':
      case 'ETH':
        return amount * currentPrice;
      case 'USDC':
      case 'USD':
        return amount;
      default:
        throw new PositionSizeError(`Unsupported currency conversion: ${currency}`);
    }
  }

  /**
   * Convert amount from USD to base currency
   */
  private static convertFromUSD(
    amountUSD: number,
    currency: string,
    currentPrice: number
  ): number {
    switch (currency) {
      case 'BTC':
      case 'ETH':
        return amountUSD / currentPrice;
      case 'USDC':
      case 'USD':
        return amountUSD;
      default:
        throw new PositionSizeError(`Unsupported currency conversion: ${currency}`);
    }
  }

  /**
   * Round quantity to lot size
   */
  private static roundToLotSize(quantity: number, lotSize: number): number {
    return Math.floor(quantity / lotSize) * lotSize;
  }

  /**
   * Round number to specified decimal places
   */
  private static round(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}
