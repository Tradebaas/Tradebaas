import { EntitlementCheck } from './types';

export interface Entitlement {
  userId: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  maxWorkers: number;
  expiresAt?: number;
  isActive: boolean;
}

const TIER_LIMITS = {
  free: 1,
  basic: 3,
  pro: 10,
  enterprise: 50,
};

export class EntitlementService {
  private entitlements: Map<string, Entitlement> = new Map();

  async checkEntitlement(
    userId: string, 
    currentWorkerCount: number
  ): Promise<EntitlementCheck> {
    let entitlement = this.entitlements.get(userId);

    if (!entitlement) {
      entitlement = {
        userId,
        tier: 'free',
        maxWorkers: TIER_LIMITS.free,
        isActive: true,
      };
      this.entitlements.set(userId, entitlement);
    }

    if (!entitlement.isActive) {
      return {
        isEntitled: false,
        tier: entitlement.tier,
        maxWorkers: entitlement.maxWorkers,
        currentWorkers: currentWorkerCount,
        reason: 'Subscription is not active',
      };
    }

    if (entitlement.expiresAt && Date.now() > entitlement.expiresAt) {
      entitlement.isActive = false;
      this.entitlements.set(userId, entitlement);
      return {
        isEntitled: false,
        tier: entitlement.tier,
        maxWorkers: entitlement.maxWorkers,
        currentWorkers: currentWorkerCount,
        reason: 'Subscription has expired',
      };
    }

    if (currentWorkerCount >= entitlement.maxWorkers) {
      return {
        isEntitled: false,
        tier: entitlement.tier,
        maxWorkers: entitlement.maxWorkers,
        currentWorkers: currentWorkerCount,
        reason: `Maximum worker limit reached (${entitlement.maxWorkers})`,
      };
    }

    return {
      isEntitled: true,
      tier: entitlement.tier,
      maxWorkers: entitlement.maxWorkers,
      currentWorkers: currentWorkerCount,
    };
  }

  async setEntitlement(entitlement: Entitlement): Promise<void> {
    this.entitlements.set(entitlement.userId, entitlement);
  }

  async getEntitlement(userId: string): Promise<Entitlement | null> {
    return this.entitlements.get(userId) || null;
  }

  async upgradeUser(userId: string, tier: Entitlement['tier'], durationDays?: number): Promise<void> {
    const entitlement: Entitlement = {
      userId,
      tier,
      maxWorkers: TIER_LIMITS[tier],
      isActive: true,
    };

    if (durationDays) {
      entitlement.expiresAt = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
    }

    this.entitlements.set(userId, entitlement);
  }

  async downgradeExpired(): Promise<string[]> {
    const now = Date.now();
    const downgraded: string[] = [];

    for (const [userId, entitlement] of this.entitlements.entries()) {
      if (entitlement.expiresAt && now > entitlement.expiresAt && entitlement.isActive) {
        entitlement.isActive = false;
        entitlement.tier = 'free';
        entitlement.maxWorkers = TIER_LIMITS.free;
        this.entitlements.set(userId, entitlement);
        downgraded.push(userId);
      }
    }

    return downgraded;
  }

  getTierLimits() {
    return { ...TIER_LIMITS };
  }
}
