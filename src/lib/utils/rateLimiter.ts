export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  burstSize?: number;
}

export class RateLimiter {
  private requestQueue: Array<() => void> = [];
  private requestTimes: number[] = [];
  private processing = false;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequestsPerSecond: config.maxRequestsPerSecond,
      burstSize: config.burstSize || config.maxRequestsPerSecond,
    };
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const queueLength = this.requestQueue.length;
      
      if (queueLength > 20) {
        console.warn(`[RateLimiter] Large queue detected: ${queueLength} requests waiting`);
      }
      
      this.requestQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      
      this.requestTimes = this.requestTimes.filter(t => now - t < 1000);

      if (this.requestTimes.length >= this.config.burstSize!) {
        const oldestRequest = this.requestTimes[0];
        const waitTime = 1000 - (now - oldestRequest);
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime + 50));
          continue;
        }
      }

      const request = this.requestQueue.shift();
      if (request) {
        this.requestTimes.push(Date.now());
        
        try {
          await request();
        } catch (error) {
          console.error('[RateLimiter] Request failed:', error);
        }

        const minDelay = Math.ceil(1000 / this.config.maxRequestsPerSecond);
        if (this.requestQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, minDelay));
        }
      }
    }

    this.processing = false;
  }

  getQueueLength(): number {
    return this.requestQueue.length;
  }

  clear(): void {
    this.requestQueue = [];
    this.requestTimes = [];
  }
}

export const globalRateLimiter = new RateLimiter({
  maxRequestsPerSecond: 5,
  burstSize: 10,
});
