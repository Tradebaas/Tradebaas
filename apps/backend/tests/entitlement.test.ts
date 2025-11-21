import { describe, it, expect, beforeEach } from 'vitest';
import { EntitlementService } from '../src/orchestrator/EntitlementService';

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(() => {
    service = new EntitlementService();
  });

  describe('checkEntitlement', () => {
    it('should create free tier entitlement for new user', async () => {
      const check = await service.checkEntitlement('new-user', 0);

      expect(check.isEntitled).toBe(true);
      expect(check.tier).toBe('free');
      expect(check.maxWorkers).toBe(1);
      expect(check.currentWorkers).toBe(0);
    });

    it('should allow user within worker limit', async () => {
      await service.upgradeUser('test-user', 'basic', 30);
      const check = await service.checkEntitlement('test-user', 2);

      expect(check.isEntitled).toBe(true);
      expect(check.tier).toBe('basic');
      expect(check.maxWorkers).toBe(3);
    });

    it('should reject user at worker limit', async () => {
      await service.upgradeUser('test-user', 'basic', 30);
      const check = await service.checkEntitlement('test-user', 3);

      expect(check.isEntitled).toBe(false);
      expect(check.reason).toContain('limit');
    });

    it('should reject user over worker limit', async () => {
      await service.upgradeUser('test-user', 'free', 30);
      const check = await service.checkEntitlement('test-user', 1);

      expect(check.isEntitled).toBe(false);
      expect(check.reason).toContain('limit');
    });

    it('should reject expired subscription', async () => {
      // Create subscription with expiry 1 second in the past
      await service.setEntitlement({
        userId: 'test-user',
        tier: 'pro',
        maxWorkers: 10,
        isActive: true,
        expiresAt: Date.now() - 1000, // 1 second ago
      });
      
      const check = await service.checkEntitlement('test-user', 0);

      expect(check.isEntitled).toBe(false);
      expect(check.reason).toContain('expired');
    });

    it('should reject inactive subscription', async () => {
      await service.setEntitlement({
        userId: 'test-user',
        tier: 'pro',
        maxWorkers: 10,
        isActive: false,
      });

      const check = await service.checkEntitlement('test-user', 0);

      expect(check.isEntitled).toBe(false);
      expect(check.reason).toContain('not active');
    });
  });

  describe('upgradeUser', () => {
    it('should upgrade user to basic tier', async () => {
      await service.upgradeUser('test-user', 'basic', 30);
      const entitlement = await service.getEntitlement('test-user');

      expect(entitlement?.tier).toBe('basic');
      expect(entitlement?.maxWorkers).toBe(3);
      expect(entitlement?.isActive).toBe(true);
      expect(entitlement?.expiresAt).toBeDefined();
    });

    it('should upgrade user to pro tier', async () => {
      await service.upgradeUser('test-user', 'pro', 30);
      const entitlement = await service.getEntitlement('test-user');

      expect(entitlement?.tier).toBe('pro');
      expect(entitlement?.maxWorkers).toBe(10);
    });

    it('should upgrade user to enterprise tier', async () => {
      await service.upgradeUser('test-user', 'enterprise', 365);
      const entitlement = await service.getEntitlement('test-user');

      expect(entitlement?.tier).toBe('enterprise');
      expect(entitlement?.maxWorkers).toBe(50);
    });

    it('should create lifetime subscription without expiry', async () => {
      await service.upgradeUser('test-user', 'pro');
      const entitlement = await service.getEntitlement('test-user');

      expect(entitlement?.tier).toBe('pro');
      expect(entitlement?.expiresAt).toBeUndefined();
    });
  });

  describe('setEntitlement', () => {
    it('should set custom entitlement', async () => {
      await service.setEntitlement({
        userId: 'test-user',
        tier: 'basic',
        maxWorkers: 5,
        isActive: true,
        expiresAt: Date.now() + 86400000,
      });

      const entitlement = await service.getEntitlement('test-user');
      expect(entitlement?.maxWorkers).toBe(5);
    });

    it('should override existing entitlement', async () => {
      await service.upgradeUser('test-user', 'free', 30);
      
      await service.setEntitlement({
        userId: 'test-user',
        tier: 'enterprise',
        maxWorkers: 50,
        isActive: true,
      });

      const entitlement = await service.getEntitlement('test-user');
      expect(entitlement?.tier).toBe('enterprise');
    });
  });

  describe('getEntitlement', () => {
    it('should return null for non-existent user', async () => {
      const entitlement = await service.getEntitlement('non-existent');
      expect(entitlement).toBeNull();
    });

    it('should return entitlement for existing user', async () => {
      await service.upgradeUser('test-user', 'basic', 30);
      const entitlement = await service.getEntitlement('test-user');

      expect(entitlement).not.toBeNull();
      expect(entitlement?.userId).toBe('test-user');
    });
  });

  describe('downgradeExpired', () => {
    it('should downgrade expired subscriptions', async () => {
      // Create expired subscription
      await service.setEntitlement({
        userId: 'user-1',
        tier: 'pro',
        maxWorkers: 10,
        isActive: true,
        expiresAt: Date.now() - 1000, // 1 second ago
      });
      
      await service.upgradeUser('user-2', 'basic', 30);
      
      const downgraded = await service.downgradeExpired();

      expect(downgraded).toContain('user-1');
      expect(downgraded).not.toContain('user-2');

      const user1Entitlement = await service.getEntitlement('user-1');
      expect(user1Entitlement?.tier).toBe('free');
      expect(user1Entitlement?.isActive).toBe(false);
    });

    it('should not downgrade active subscriptions', async () => {
      await service.upgradeUser('test-user', 'pro', 30);
      
      const downgraded = await service.downgradeExpired();

      expect(downgraded).not.toContain('test-user');

      const entitlement = await service.getEntitlement('test-user');
      expect(entitlement?.tier).toBe('pro');
      expect(entitlement?.isActive).toBe(true);
    });

    it('should not downgrade lifetime subscriptions', async () => {
      await service.upgradeUser('test-user', 'enterprise');
      
      const downgraded = await service.downgradeExpired();

      expect(downgraded).not.toContain('test-user');

      const entitlement = await service.getEntitlement('test-user');
      expect(entitlement?.tier).toBe('enterprise');
    });

    it('should return empty array when no downgrades needed', async () => {
      await service.upgradeUser('user-1', 'basic', 30);
      await service.upgradeUser('user-2', 'pro', 60);

      const downgraded = await service.downgradeExpired();

      expect(downgraded).toEqual([]);
    });
  });

  describe('getTierLimits', () => {
    it('should return all tier limits', () => {
      const limits = service.getTierLimits();

      expect(limits.free).toBe(1);
      expect(limits.basic).toBe(3);
      expect(limits.pro).toBe(10);
      expect(limits.enterprise).toBe(50);
    });

    it('should return copy of limits object', () => {
      const limits1 = service.getTierLimits();
      const limits2 = service.getTierLimits();

      limits1.free = 999;

      expect(limits2.free).toBe(1);
    });
  });
});
