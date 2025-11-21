export interface RateLimitConfig {
    maxRequestsPerSecond: number;
    burstSize?: number;
}
export declare class RateLimiter {
    private requestQueue;
    private requestTimes;
    private processing;
    private config;
    constructor(config: RateLimitConfig);
    throttle<T>(fn: () => Promise<T>): Promise<T>;
    private processQueue;
    getQueueLength(): number;
    clear(): void;
}
export declare const globalRateLimiter: RateLimiter;
//# sourceMappingURL=rateLimiter.d.ts.map