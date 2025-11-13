# Comprehensive Error Handling - Third Iteration (Vortex) Strategy

## Overview

Comprehensive error handling has been added to the Third Iteration strategy and its AdvancedBracketManager to ensure robust, production-ready operation with detailed logging, graceful degradation, and recovery mechanisms.

## Error Handling Enhancements

### 1. Strategy-Level Error Handling

#### **monitorAndTrade() Method**
- **Granular try-catch blocks** for each operation:
  - Candle fetching
  - Indicator calculation
  - Signal building and execution
- **Specific error logging** with contextual information
- **Graceful degradation**: Errors in one cycle don't crash the entire strategy
- **Event emissions**: All errors are emitted as events for UI tracking

#### **executeTrade() Method**
- **Multi-stage validation** with specific error handling:
  - Balance fetching validation
  - Instrument data validation
  - Risk calculation error handling
  - Leverage cap enforcement
  - Amount validation and normalization
  - Entry order placement
  - Bracket order attachment
  
- **Emergency position closure**: If bracket attachment fails after entry, automatically attempt to close the position

- **Detailed error context** for every failure point:
  - Action being performed
  - Strategy name
  - Instrument
  - Relevant parameters (equity, prices, quantities)

#### **New emitErrorLog() Method**
```typescript
private emitErrorLog(error: unknown, action: string, context: Record<string, unknown>): void
```

Creates structured error logs with:
- Unique error ID
- Timestamp
- Error type classification
- Full stack trace
- Contextual information
- API response details (for DeribitError)

### 2. AdvancedBracketManager Error Handling

#### **attachInitialBracket() Method**
- **Parameter validation**: 
  - Validates totalQty > 0
  - Validates all prices > 0
  - Validates TP1 quantity is sufficient
  
- **Order placement error handling**:
  - Separate try-catch for SL and TP1 orders
  - If TP1 fails, automatically cancels SL order (cleanup)
  - Detailed logging of all parameters
  
- **Response validation**: Checks for missing order_id in responses

#### **maybeTrail() Method**
- **Price validation**: Checks for valid nowPrice
- **Indicator retrieval** error handling
- **Per-method error handling**: Each trail method (swing, EMA20, oppBB, rsiFlip) has error protection
- **Update throttling**: Prevents rate limit issues
- **Update failure gracefully handled**: Trailing failure doesn't crash the position

#### **moveSLToBreakeven() Method**
- **Pre-flight checks**: Validates order ID and quantity
- **Two-phase error handling**:
  1. Cancel original SL (separate try-catch)
  2. Place new BE SL (separate try-catch)
- **Response validation**: Checks for order_id in response
- **Detailed logging** at each step

#### **updateStopLoss() Method**
- **Parameter validation**: Checks order ID and new price validity
- **Detailed logging**: Logs old price, new price, and amount
- **Non-throwing errors**: Logs warnings but doesn't throw to prevent position abandonment

#### **closeRunner() Method**
- **SL cancellation** with error handling
- **Quantity validation**: Checks remaining quantity before close
- **Detailed logging** with reason tracking
- **Direction validation**: Ensures correct order direction

#### **cancelAll() Method**
- **Iterates through all orders** with individual error handling
- **Continues on failure**: One cancellation failure doesn't prevent others
- **Status update**: Always updates state to 'closed'

### 3. Error Types and Classification

Errors are classified into types for better handling:

- `STRATEGY_ERROR`: General strategy errors
- `CONNECTION_ERROR`: Network/connection issues
- `INVALID_PARAMS`: Parameter validation failures
- `INVALID_AMOUNT`: Quantity/amount issues
- `UNKNOWN_ERROR`: Unclassified errors

### 4. Logging Strategy

#### **Log Levels**:
- `error`: Critical failures that prevent operation
- `warn`: Issues that are handled but noteworthy
- `info`: Normal operational events

#### **Structured Logging**:
All logs include:
- Timestamp
- Component name ([ThirdIterationStrategy] or [AdvancedBracketManager])
- Action/operation
- Relevant contextual data

### 5. Event System

Events emitted for external tracking:
- `STRATEGY_STARTED`
- `SIGNAL`
- `ENTRY_PLACED`
- `TP1_FILLED`
- `SL_MOVED_BE`
- `TRAIL_UPDATE`
- `ALL_EXITED`
- `CANCELLED`
- `ERROR`
- `RISK_CALCULATION_FAILED`
- `LEVERAGE_EXCEEDED`
- `RISK_WARNINGS`
- `AMOUNT_VALIDATION_FAILED`
- `MAX_DAILY_TRADES`
- `MAX_DAILY_LOSS`

### 6. Safety Mechanisms

#### **Circuit Breakers**:
- Daily trade count limit
- Daily loss limit
- Automatic strategy stop when limits reached

#### **Validation Guards**:
- Equity validation (> 0)
- Price validation (> 0)
- Quantity validation (> 0, multiple of contract size)
- Leverage validation (≤ maxLeverage)

#### **Recovery Mechanisms**:
- State recovery on restart
- Open order detection
- Position reconciliation

### 7. Error Recovery Flows

#### **Entry Failure Recovery**:
1. Detect entry order failure
2. Log detailed error
3. Emit error event
4. Don't update position state
5. Continue monitoring for next opportunity

#### **Bracket Failure Recovery**:
1. Detect bracket attachment failure
2. Log detailed error
3. Attempt emergency position close
4. If emergency close fails, log as critical
5. Clear position and bracket manager
6. Emit error events

#### **Trailing Failure Recovery**:
1. Detect trailing update failure
2. Log warning (not critical)
3. Continue with existing bracket
4. Retry on next trailing cycle

## Best Practices Implemented

1. **Never swallow errors silently**: All errors are logged
2. **Fail gracefully**: Errors don't crash the strategy
3. **Provide context**: Every error includes relevant operation context
4. **Validate early**: Check parameters before expensive operations
5. **Clean up on failure**: Cancel orders when operations fail
6. **Log liberally**: Info logs for success, warn for handled issues, error for failures
7. **Structured data**: All logs and errors include structured metadata
8. **Emit events**: External systems can track strategy health
9. **Non-blocking**: Individual failures don't block the monitoring loop

## Testing Recommendations

To test error handling:

1. **Network failures**: Disconnect during trade execution
2. **Invalid parameters**: Submit trades with edge-case values
3. **API errors**: Simulate API rate limits or rejected orders
4. **State recovery**: Stop/start strategy with open positions
5. **Bracket failures**: Simulate TP1 placement failure
6. **Trailing errors**: Provide invalid indicator data
7. **Emergency scenarios**: Test position close when bracket fails

## Future Enhancements

Potential improvements:
1. Retry logic with exponential backoff
2. Dead letter queue for failed operations
3. Alerting system for critical errors
4. Error metrics and dashboards
5. Automatic position reconciliation
6. Health check endpoints
7. Circuit breaker metrics
