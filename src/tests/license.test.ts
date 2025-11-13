import { describe, it, expect, beforeEach, vi } from 'vitest';

type Tier = 'free' | 'basic' | 'premium' | 'enterprise';

interface Entitlement {
  userId: string;
  tier: Tier;
  expiry: string | null;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  appleId?: string;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  tier: Tier;
  price: number;
  duration: number;
}

const PRODUCTS: Product[] = [
  { id: 'basic_monthly', name: 'Basic Monthly', tier: 'basic', price: 9.99, duration: 30 },
  { id: 'premium_monthly', name: 'Premium Monthly', tier: 'premium', price: 29.99, duration: 30 },
  { id: 'enterprise_yearly', name: 'Enterprise Yearly', tier: 'enterprise', price: 299.99, duration: 365 },
];

const mockKV = new Map<string, any>();

const mockSparkAPI = {
  user: async () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    login: 'testuser',
    avatarUrl: '',
    isOwner: false,
  }),
  kv: {
    get: async <T>(key: string): Promise<T | undefined> => {
      return mockKV.get(key);
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      mockKV.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      mockKV.delete(key);
    },
    keys: async (): Promise<string[]> => {
      return Array.from(mockKV.keys());
    },
  },
};

class LicenseService {
  private currentUser: User | null = null;

  async initialize(): Promise<void> {
    const user = await mockSparkAPI.user();
    this.currentUser = {
      id: user.id,
      email: user.email || '',
      createdAt: new Date().toISOString(),
    };

    const existingUser = await mockSparkAPI.kv.get<User>(`user:${user.id}`);
    if (!existingUser) {
      await mockSparkAPI.kv.set(`user:${user.id}`, this.currentUser);
    }
  }

  async getEntitlement(): Promise<Entitlement | null> {
    if (!this.currentUser) {
      await this.initialize();
    }

    const entitlement = await mockSparkAPI.kv.get<Entitlement>(
      `entitlement:${this.currentUser!.id}`
    );

    return entitlement || null;
  }

  async grantEntitlement(userId: string, tier: Tier, durationDays: number | null): Promise<Entitlement> {
    const now = new Date().toISOString();
    let expiry: string | null = null;

    if (durationDays !== null) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + durationDays);
      expiry = expiryDate.toISOString();
    }

    const entitlement: Entitlement = {
      userId,
      tier,
      expiry,
      createdAt: now,
      updatedAt: now,
    };

    await mockSparkAPI.kv.set(`entitlement:${userId}`, entitlement);

    return entitlement;
  }

  async verifyReceipt(receipt: string, productId: string): Promise<{ valid: boolean; entitlement?: Entitlement; error?: string }> {
    if (!this.currentUser) {
      return { valid: false, error: 'User not authenticated' };
    }

    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) {
      return { valid: false, error: 'Invalid product ID' };
    }

    if (!receipt.startsWith('receipt_') || receipt.length < 20) {
      return { valid: false, error: 'Invalid receipt format' };
    }

    const entitlement = await this.grantEntitlement(
      this.currentUser.id,
      product.tier,
      product.duration
    );

    return { valid: true, entitlement };
  }

  getProducts(): Product[] {
    return PRODUCTS;
  }

  async getEntitlementStatus(): Promise<{
    tier: Tier;
    expiry: string | null;
    isActive: boolean;
    daysRemaining: number | null;
  }> {
    const entitlement = await this.getEntitlement();

    if (!entitlement) {
      return {
        tier: 'free',
        expiry: null,
        isActive: false,
        daysRemaining: null,
      };
    }

    const now = new Date();
    const isActive = !entitlement.expiry || new Date(entitlement.expiry) > now;
    
    let daysRemaining: number | null = null;
    if (entitlement.expiry) {
      const expiryDate = new Date(entitlement.expiry);
      daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      tier: isActive ? entitlement.tier : 'free',
      expiry: entitlement.expiry,
      isActive,
      daysRemaining,
    };
  }
}

describe('License Service', () => {
  let licenseService: LicenseService;

  beforeEach(async () => {
    mockKV.clear();
    licenseService = new LicenseService();
    await licenseService.initialize();
  });

  describe('Initialization', () => {
    it('should initialize with user from Spark API', async () => {
      const entitlement = await licenseService.getEntitlement();
      expect(entitlement).toBeNull();
    });

    it('should create user record in KV', async () => {
      const user = await mockSparkAPI.kv.get<User>('user:test-user-id');
      expect(user).toBeDefined();
      expect(user?.id).toBe('test-user-id');
      expect(user?.email).toBe('test@example.com');
    });
  });

  describe('Entitlement Management', () => {
    it('should grant basic entitlement', async () => {
      const entitlement = await licenseService.grantEntitlement('test-user-id', 'basic', 30);
      
      expect(entitlement.userId).toBe('test-user-id');
      expect(entitlement.tier).toBe('basic');
      expect(entitlement.expiry).toBeDefined();
      expect(entitlement.createdAt).toBeDefined();
    });

    it('should grant premium entitlement', async () => {
      const entitlement = await licenseService.grantEntitlement('test-user-id', 'premium', 30);
      
      expect(entitlement.tier).toBe('premium');
    });

    it('should grant enterprise entitlement', async () => {
      const entitlement = await licenseService.grantEntitlement('test-user-id', 'enterprise', 365);
      
      expect(entitlement.tier).toBe('enterprise');
    });

    it('should grant lifetime entitlement with null expiry', async () => {
      const entitlement = await licenseService.grantEntitlement('test-user-id', 'premium', null);
      
      expect(entitlement.expiry).toBeNull();
    });

    it('should retrieve granted entitlement', async () => {
      await licenseService.grantEntitlement('test-user-id', 'basic', 30);
      const entitlement = await licenseService.getEntitlement();
      
      expect(entitlement).toBeDefined();
      expect(entitlement?.tier).toBe('basic');
    });

    it('should return null for non-existent entitlement', async () => {
      const entitlement = await licenseService.getEntitlement();
      expect(entitlement).toBeNull();
    });
  });

  describe('Receipt Verification', () => {
    it('should verify valid basic receipt', async () => {
      const result = await licenseService.verifyReceipt('receipt_basic_test_12345', 'basic_monthly');
      
      expect(result.valid).toBe(true);
      expect(result.entitlement).toBeDefined();
      expect(result.entitlement?.tier).toBe('basic');
    });

    it('should verify valid premium receipt', async () => {
      const result = await licenseService.verifyReceipt('receipt_premium_test_12345', 'premium_monthly');
      
      expect(result.valid).toBe(true);
      expect(result.entitlement?.tier).toBe('premium');
    });

    it('should verify valid enterprise receipt', async () => {
      const result = await licenseService.verifyReceipt('receipt_enterprise_test_12345', 'enterprise_yearly');
      
      expect(result.valid).toBe(true);
      expect(result.entitlement?.tier).toBe('enterprise');
    });

    it('should reject invalid product ID', async () => {
      const result = await licenseService.verifyReceipt('receipt_test_12345', 'invalid_product');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid product ID');
    });

    it('should reject malformed receipt', async () => {
      const result = await licenseService.verifyReceipt('invalid', 'basic_monthly');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid receipt format');
    });

    it('should reject short receipt', async () => {
      const result = await licenseService.verifyReceipt('receipt_123', 'basic_monthly');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid receipt format');
    });
  });

  describe('Entitlement Status', () => {
    it('should return free tier for no entitlement', async () => {
      const status = await licenseService.getEntitlementStatus();
      
      expect(status.tier).toBe('free');
      expect(status.isActive).toBe(false);
      expect(status.expiry).toBeNull();
      expect(status.daysRemaining).toBeNull();
    });

    it('should return active status for valid entitlement', async () => {
      await licenseService.grantEntitlement('test-user-id', 'basic', 30);
      const status = await licenseService.getEntitlementStatus();
      
      expect(status.tier).toBe('basic');
      expect(status.isActive).toBe(true);
      expect(status.daysRemaining).toBeGreaterThan(0);
      expect(status.daysRemaining).toBeLessThanOrEqual(30);
    });

    it('should calculate days remaining correctly', async () => {
      await licenseService.grantEntitlement('test-user-id', 'premium', 30);
      const status = await licenseService.getEntitlementStatus();
      
      expect(status.daysRemaining).toBeGreaterThan(28);
      expect(status.daysRemaining).toBeLessThanOrEqual(31);
    });

    it('should handle expired entitlement', async () => {
      const entitlement: Entitlement = {
        userId: 'test-user-id',
        tier: 'basic',
        expiry: new Date(Date.now() - 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await mockSparkAPI.kv.set('entitlement:test-user-id', entitlement);
      const status = await licenseService.getEntitlementStatus();
      
      expect(status.tier).toBe('free');
      expect(status.isActive).toBe(false);
    });

    it('should handle lifetime entitlement', async () => {
      await licenseService.grantEntitlement('test-user-id', 'enterprise', null);
      const status = await licenseService.getEntitlementStatus();
      
      expect(status.tier).toBe('enterprise');
      expect(status.isActive).toBe(true);
      expect(status.expiry).toBeNull();
      expect(status.daysRemaining).toBeNull();
    });
  });

  describe('Product Catalog', () => {
    it('should return all available products', () => {
      const products = licenseService.getProducts();
      
      expect(products).toHaveLength(3);
      expect(products.some(p => p.tier === 'basic')).toBe(true);
      expect(products.some(p => p.tier === 'premium')).toBe(true);
      expect(products.some(p => p.tier === 'enterprise')).toBe(true);
    });

    it('should have correct product structure', () => {
      const products = licenseService.getProducts();
      
      products.forEach(product => {
        expect(product.id).toBeDefined();
        expect(product.name).toBeDefined();
        expect(product.tier).toBeDefined();
        expect(product.price).toBeGreaterThan(0);
        expect(product.duration).toBeGreaterThan(0);
      });
    });
  });
});
