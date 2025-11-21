/**
 * Deribit Amount Validator & Normalizer
 * 
 * Use this to debug "must be a multiple of contract size" errors
 * Call this BEFORE any Deribit order API call to validate amounts
 */

export interface DeribitInstrument {
  instrument_name: string;
  contract_size: number;
  min_trade_amount: number;
  tick_size: number;
  max_leverage?: number;
}

export interface AmountValidationResult {
  valid: boolean;
  normalizedAmount: number;
  originalAmount: number;
  errors: string[];
  warnings: string[];
  details: {
    contractSize: number;
    minTradeAmount: number;
    isMultipleOfContractSize: boolean;
    meetsMinimum: boolean;
    adjustment: number;
  };
}

/**
 * Validates and normalizes an amount for Deribit trading
 * 
 * @param amount - The desired trade amount
 * @param instrument - Instrument details from Deribit API
 * @returns Validation result with normalized amount
 */
export function validateDeribitAmount(
  amount: number,
  instrument: DeribitInstrument
): AmountValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const contractSize = instrument.contract_size || 10;
  const minTradeAmount = instrument.min_trade_amount || 10;

  if (amount <= 0) {
    errors.push(`Amount must be positive (got ${amount})`);
    return {
      valid: false,
      normalizedAmount: 0,
      originalAmount: amount,
      errors,
      warnings,
      details: {
        contractSize,
        minTradeAmount,
        isMultipleOfContractSize: false,
        meetsMinimum: false,
        adjustment: 0,
      },
    };
  }

  const remainder = amount % contractSize;
  const isMultiple = remainder === 0;
  
  if (!isMultiple) {
    warnings.push(`Amount ${amount} is not a multiple of contract size ${contractSize} (remainder: ${remainder})`);
  }

  const normalizedAmount = Math.floor(amount / contractSize) * contractSize;
  const adjustment = amount - normalizedAmount;

  if (adjustment > 0) {
    warnings.push(`Amount adjusted from ${amount} to ${normalizedAmount} (difference: ${adjustment})`);
  }

  const meetsMinimum = normalizedAmount >= minTradeAmount;
  
  if (!meetsMinimum) {
    errors.push(`Normalized amount ${normalizedAmount} is below minimum trade amount ${minTradeAmount}`);
    errors.push(`Original amount ${amount} was too small after rounding to contract size multiples`);
  }

  if (normalizedAmount > amount * 1.1) {
    warnings.push(`Warning: Normalized amount (${normalizedAmount}) is significantly higher than original (${amount}) - this shouldn't happen`);
  }

  const valid = errors.length === 0;

  return {
    valid,
    normalizedAmount,
    originalAmount: amount,
    errors,
    warnings,
    details: {
      contractSize,
      minTradeAmount,
      isMultipleOfContractSize: remainder === 0,
      meetsMinimum,
      adjustment,
    },
  };
}

/**
 * Quick normalize function - throws error if invalid
 * Use when you need a simple "normalize or fail" operation
 */
export function normalizeDeribitAmount(
  amount: number,
  contractSize: number,
  minTradeAmount: number
): number {
  if (amount <= 0) {
    throw new Error(`Invalid amount: ${amount} (must be positive)`);
  }

  const normalized = Math.floor(amount / contractSize) * contractSize;

  if (normalized < minTradeAmount) {
    throw new Error(
      `Normalized amount ${normalized} is below minimum ${minTradeAmount} ` +
      `(original: ${amount}, contractSize: ${contractSize})`
    );
  }

  return normalized;
}

/**
 * Helper to log validation results in a readable format
 */
export function logValidationResult(
  result: AmountValidationResult,
  logger?: { warn: (msg: string) => void; error: (msg: string) => void }
): void {
  const log = logger || {
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
  };

  if (result.errors.length > 0) {
    log.error('❌ Amount Validation FAILED:');
    result.errors.forEach(err => log.error(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    log.warn('⚠️  Amount Validation Warnings:');
    result.warnings.forEach(warn => log.warn(`  - ${warn}`));
  }

  if (result.valid) {
    console.log('✅ Amount validation passed:', {
      original: result.originalAmount,
      normalized: result.normalizedAmount,
      adjustment: result.details.adjustment,
    });
  }
}

/**
 * Test function - run this to verify the validator works correctly
 */
export function testAmountValidator(): void {
  console.log('🧪 Testing Deribit Amount Validator\n');

  const testInstrument: DeribitInstrument = {
    instrument_name: 'BTC_USDC-PERPETUAL',
    contract_size: 10,
    min_trade_amount: 10,
    tick_size: 0.5,
  };

  const testCases = [
    { amount: 100, expected: 'valid' },
    { amount: 105, expected: 'warning (not multiple)' },
    { amount: 123.456, expected: 'warning (normalized to 120)' },
    { amount: 5, expected: 'error (below minimum)' },
    { amount: 15, expected: 'warning (normalized to 10)' },
    { amount: 0, expected: 'error (zero)' },
    { amount: -10, expected: 'error (negative)' },
    { amount: 1000, expected: 'valid' },
  ];

  console.log(`Instrument: ${testInstrument.instrument_name}`);
  console.log(`Contract Size: ${testInstrument.contract_size}`);
  console.log(`Min Trade Amount: ${testInstrument.min_trade_amount}\n`);

  testCases.forEach(({ amount, expected }) => {
    console.log(`\nTest: amount = ${amount} (${expected})`);
    console.log('─'.repeat(50));
    
    const result = validateDeribitAmount(amount, testInstrument);
    
    console.log(`Valid: ${result.valid ? '✅' : '❌'}`);
    console.log(`Original: ${result.originalAmount}`);
    console.log(`Normalized: ${result.normalizedAmount}`);
    console.log(`Adjustment: ${result.details.adjustment}`);
    
    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(err => console.log(`  ❌ ${err}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('Warnings:');
      result.warnings.forEach(warn => console.log(`  ⚠️  ${warn}`));
    }
  });

  console.log('\n✅ Test completed');
}
