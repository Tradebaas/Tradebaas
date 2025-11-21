export type DeribitEnvironment = 'live' | 'testnet';
export interface DeribitCredentials {
    apiKey: string;
    apiSecret: string;
}
export interface DeribitAuthResponse {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
    token_type: string;
}
export interface DeribitRPCRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params: Record<string, unknown>;
}
export interface DeribitRPCResponse<T = unknown> {
    jsonrpc: '2.0';
    id?: number;
    method?: string;
    params?: unknown;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export interface AccountSummary {
    currency: string;
    balance: number;
    equity: number;
    available_funds: number;
    maintenance_margin: number;
    initial_margin: number;
    margin_balance: number;
    session_funding: number;
    session_rpl: number;
    session_upl: number;
    total_pl: number;
    futures_pl: number;
    futures_session_rpl: number;
    futures_session_upl: number;
    options_value: number;
    options_pl: number;
    options_session_rpl: number;
    options_session_upl: number;
    options_delta: number;
    options_gamma: number;
    options_vega: number;
    options_theta: number;
}
export interface Instrument {
    instrument_name: string;
    tick_size: number;
    min_trade_amount: number;
    max_leverage: number;
    contract_size: number;
    settlement_period: string;
    settlement_currency: string;
    kind: string;
    quote_currency: string;
}
export interface Ticker {
    instrument_name: string;
    last_price: number;
    mark_price: number;
    best_bid_price: number;
    best_ask_price: number;
    mid_price?: number;
}
export interface OTOCOOrder {
    type: string;
    amount?: number;
    trigger?: string;
    trigger_price?: number;
    price?: number;
    reduce_only?: boolean;
}
export interface OrderResponse {
    order_id: string;
    order_state: string;
    label?: string;
    oco_ref?: string;
    direction: string;
    amount: number;
    price?: number;
    trigger?: string;
    trigger_price?: number;
    reduce_only?: boolean;
    instrument_name: string;
}
export interface Position {
    instrument_name: string;
    size: number;
    direction: 'buy' | 'sell';
    average_price: number;
    mark_price: number;
    index_price: number;
    floating_profit_loss: number;
    realized_profit_loss: number;
    total_profit_loss: number;
    leverage: number;
    initial_margin: number;
    maintenance_margin: number;
    kind: string;
    settlement_price?: number;
}
export declare enum DeribitErrorType {
    NETWORK_ERROR = "NETWORK_ERROR",
    AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
    INVALID_PARAMS = "INVALID_PARAMS",
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
    RATE_LIMIT = "RATE_LIMIT",
    SERVER_ERROR = "SERVER_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
    TIMEOUT_ERROR = "TIMEOUT_ERROR",
    WEBSOCKET_ERROR = "WEBSOCKET_ERROR"
}
export declare class DeribitError extends Error {
    type: DeribitErrorType;
    code?: number | undefined;
    data?: unknown | undefined;
    constructor(type: DeribitErrorType, message: string, code?: number | undefined, data?: unknown | undefined);
}
export interface TelemetryHooks {
    onRPC?: (method: string, params: Record<string, unknown>, duration: number, success: boolean) => void;
    onWS?: (event: 'open' | 'close' | 'error' | 'reconnect', details?: unknown) => void;
    onFill?: (fill: unknown) => void;
    onOrderUpdate?: (order: unknown) => void;
}
export declare class DeribitClient {
    private ws;
    private requestId;
    private pendingRequests;
    private accessToken;
    private refreshToken;
    private tokenExpiresAt;
    private environment;
    private credentials;
    private reconnectAttempts;
    private reconnectTimeout;
    private onStateChange?;
    private currentState;
    private subscriptionHandlers;
    private activeSubscriptions;
    private heartbeatInterval;
    private lastHeartbeat;
    private staleCheckInterval;
    private instrumentCache;
    private instrumentCacheExpiry;
    private telemetryHooks;
    private isReconnecting;
    constructor(environment?: DeribitEnvironment, onStateChange?: (state: ConnectionState) => void, telemetryHooks?: TelemetryHooks);
    private setState;
    private getEndpoint;
    private generateId;
    private calculateBackoff;
    private normalizeError;
    private isRetryableError;
    private isRetryableMethod;
    private startHeartbeat;
    private stopHeartbeat;
    private resubscribeAll;
    private callRPC;
    private handleMessage;
    private handleError;
    private handleClose;
    private attemptReconnect;
    connect(credentials: DeribitCredentials): Promise<void>;
    private testConnection;
    private authenticate;
    refreshAccessToken(): Promise<void>;
    isTokenExpiringSoon(): boolean;
    disconnect(): void;
    getAccessToken(): string | null;
    isConnected(): boolean;
    getCurrentState(): ConnectionState;
    setEnvironment(environment: DeribitEnvironment): void;
    getEnvironment(): DeribitEnvironment;
    getCachedInstruments(currency?: string, kind?: string, forceRefresh?: boolean): Promise<Instrument[]>;
    getInstrument(instrumentName: string): Promise<Instrument | null>;
    getAccountSummary(currency?: string): Promise<AccountSummary>;
    getInstruments(currency: string, kind: string): Promise<Instrument[]>;
    getTicker(instrumentName: string): Promise<Ticker>;
    placeBuyOrder(instrumentName: string, amount: number, price?: number, orderType?: string, label?: string, linkedOrderType?: string, otocoConfig?: OTOCOOrder[], triggerFillCondition?: 'first_hit' | 'complete_fill'): Promise<OrderResponse>;
    placeSellOrder(instrumentName: string, amount: number, price?: number, orderType?: string, label?: string, reduceOnly?: boolean, trigger?: string): Promise<OrderResponse>;
    closePosition(instrumentName: string, orderType?: string): Promise<OrderResponse>;
    cancelAllByInstrument(instrumentName: string): Promise<number>;
    getOpenOrders(instrumentName?: string): Promise<OrderResponse[]>;
    cancelOrder(orderId: string): Promise<OrderResponse>;
    cancelAllOrders(instrumentName?: string): Promise<number>;
    subscribe(channels: string[], handler?: (channel: string, data: unknown) => void): Promise<void>;
    onSubscription(channel: string, handler: (data: unknown) => void): void;
    clearSubscriptions(): void;
    setTelemetryHooks(hooks: TelemetryHooks): void;
    request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    getTradingViewChartData(instrumentName: string, startTimestamp: number, endTimestamp: number, resolution: string): Promise<{
        ticks: number[];
        open: number[];
        high: number[];
        low: number[];
        close: number[];
        volume: number[];
    }>;
    getPositions(currency?: string, kind?: string): Promise<Position[]>;
    getPosition(instrumentName: string): Promise<Position | null>;
}
export type ConnectionState = 'Stopped' | 'Connecting' | 'Analyzing' | 'Active' | 'Error';
//# sourceMappingURL=deribitClient.d.ts.map