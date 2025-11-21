import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function getDecimalPlaces(num: number): number {
  const str = num.toString();
  if (!str.includes('.')) return 0;
  return str.split('.')[1].length;
}

export function roundToMultiple(value: number, multiple: number): number {
  if (multiple <= 0) return value;
  if (value <= 0) return 0;
  
  const decimalPlaces = Math.max(getDecimalPlaces(value), getDecimalPlaces(multiple));
  const scaleFactor = Math.pow(10, decimalPlaces);
  
  const scaledValue = Math.round(value * scaleFactor);
  const scaledMultiple = Math.round(multiple * scaleFactor);
  
  const contracts = Math.floor(scaledValue / scaledMultiple);
  const scaledResult = contracts * scaledMultiple;
  
  const result = scaledResult / scaleFactor;
  
  return Number(result.toFixed(decimalPlaces));
}

export function isValidMultiple(value: number, multiple: number, tolerance: number = 1e-8): boolean {
  if (multiple <= 0) return true;
  if (value <= 0) return false;
  
  const decimalPlaces = Math.max(getDecimalPlaces(value), getDecimalPlaces(multiple));
  const scaleFactor = Math.pow(10, decimalPlaces);
  
  const scaledValue = Math.round(value * scaleFactor);
  const scaledMultiple = Math.round(multiple * scaleFactor);
  
  const remainder = scaledValue % scaledMultiple;
  
  return Math.abs(remainder) < (tolerance * scaleFactor);
}

export function validateAndNormalizeAmount(
  amount: number, 
  contractSize: number, 
  minTradeAmount: number
): { 
  valid: boolean; 
  amount: number; 
  error?: string;
  details?: Record<string, unknown>;
} {
  if (amount <= 0) {
    return {
      valid: false,
      amount: 0,
      error: 'Amount must be greater than zero',
      details: { amount },
    };
  }
  
  if (contractSize <= 0) {
    return {
      valid: false,
      amount: 0,
      error: 'Contract size must be greater than zero',
      details: { contractSize },
    };
  }
  
  const normalized = roundToMultiple(amount, contractSize);
  
  if (normalized < minTradeAmount) {
    return {
      valid: false,
      amount: normalized,
      error: `Normalized amount ${normalized} is below minimum trade amount ${minTradeAmount}`,
      details: { 
        originalAmount: amount, 
        normalizedAmount: normalized, 
        minTradeAmount,
        contractSize,
      },
    };
  }
  
  if (!isValidMultiple(normalized, contractSize)) {
    return {
      valid: false,
      amount: normalized,
      error: `Amount ${normalized} is not a valid multiple of contract size ${contractSize}`,
      details: { 
        originalAmount: amount,
        normalizedAmount: normalized,
        contractSize,
      },
    };
  }
  
  return {
    valid: true,
    amount: normalized,
  };
}
