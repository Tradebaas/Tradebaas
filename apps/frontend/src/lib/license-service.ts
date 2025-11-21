export type Tier = 'free' | 'basic' | 'premium' | 'enterprise';

export interface Entitlement {
  userId: string;
  tier: Tier;
  expiry: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  appleId?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  tier: Tier;
  price: number;
  duration: number;
}

export interface VerifyReceiptRequest {
  receipt: string;
  productId: string;
}

export interface VerifyReceiptResponse {
  valid: boolean;
  entitlement?: Entitlement;
  error?: string;
}

export interface EntitlementStatus {
  tier: Tier;
  expiry: string | null;
  isActive: boolean;
  daysRemaining: number | null;
}

const PRODUCTS: Product[] = [
  { id: 'basic_monthly', name: 'Basic Monthly', tier: 'basic', price: 9.99, duration: 30 },
  { id: 'premium_monthly', name: 'Premium Monthly', tier: 'premium', price: 29.99, duration: 30 },
  { id: 'enterprise_yearly', name: 'Enterprise Yearly', tier: 'enterprise', price: 299.99, duration: 365 },
];

class LicenseService {
  private currentUser: User | null = null;

  async initialize(): Promise<void> {
    const user = await window.spark.user();
    if (!user) {
      throw new Error('No Spark user available');
    }

    const userId = String(user.id);

    this.currentUser = {
      id: userId,
      email: user.email || '',
      createdAt: new Date().toISOString(),
    };

    const existingUser = await window.spark.kv.get<User>(`user:${userId}`);
    if (!existingUser) {
      await window.spark.kv.set(`user:${userId}`, this.currentUser);
    }
  }

  async signInWithApple(appleToken: string): Promise<User> {
    if (!this.currentUser) {
      await this.initialize();
    }

    const user: User = {
      ...this.currentUser!,
      appleId: appleToken,
      createdAt: new Date().toISOString(),
    };

    await window.spark.kv.set(`user:${user.id}`, user);
    this.currentUser = user;

    return user;
  }

  async verifyReceipt(request: VerifyReceiptRequest): Promise<VerifyReceiptResponse> {
    if (!this.currentUser) {
      return { valid: false, error: 'User not authenticated' };
    }

    const product = PRODUCTS.find(p => p.id === request.productId);
    if (!product) {
      return { valid: false, error: 'Invalid product ID' };
    }

    const receiptValid = this.validateReceipt(request.receipt);
    if (!receiptValid) {
      return { valid: false, error: 'Invalid receipt' };
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + product.duration);

    const entitlement: Entitlement = {
      userId: this.currentUser.id,
      tier: product.tier,
      expiry: expiry.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storeEntitlement(entitlement);

    return { valid: true, entitlement };
  }

  async getEntitlement(): Promise<EntitlementStatus> {
    try {
      if (!this.currentUser) {
        await this.initialize();
      }

      const entitlement = await window.spark.kv.get<Entitlement>(`entitlement:${this.currentUser!.id}`);

      if (!entitlement) {
        return {
          tier: 'free',
          expiry: null,
          isActive: true,
          daysRemaining: null,
        };
      }

      const now = new Date();
      const expiryDate = entitlement.expiry ? new Date(entitlement.expiry) : null;
      const isActive = !expiryDate || expiryDate > now;
      const daysRemaining = expiryDate
        ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        tier: isActive ? entitlement.tier : 'free',
        expiry: entitlement.expiry,
        isActive,
        daysRemaining: isActive && daysRemaining !== null ? daysRemaining : null,
      };
    } catch (error) {
      console.error('Failed to get entitlement:', error);
      return {
        tier: 'free',
        expiry: null,
        isActive: true,
        daysRemaining: null,
      };
    }
  }

  async handleWebhook(notification: any): Promise<void> {
    const { notification_type, unified_receipt } = notification;

    if (!unified_receipt?.latest_receipt_info?.[0]) {
      return;
    }

    const receiptInfo = unified_receipt.latest_receipt_info[0];
    const productId = receiptInfo.product_id;
    const expiresDate = receiptInfo.expires_date_ms
      ? new Date(parseInt(receiptInfo.expires_date_ms))
      : null;

    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) {
      return;
    }

    switch (notification_type) {
      case 'INITIAL_BUY':
      case 'DID_RENEW':
        await this.updateEntitlement(product.tier, expiresDate?.toISOString() || null);
        break;
      case 'DID_FAIL_TO_RENEW':
      case 'CANCEL':
        await this.updateEntitlement('free', null);
        break;
    }
  }

  async updateEntitlement(tier: Tier, expiry: string | null): Promise<void> {
    if (!this.currentUser) {
      await this.initialize();
    }

    const entitlement: Entitlement = {
      userId: this.currentUser!.id,
      tier,
      expiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storeEntitlement(entitlement);
  }

  async grantEntitlement(userId: string, tier: Tier, durationDays: number | null): Promise<void> {
  const user = await window.spark.user();
  if (!user || !user.isOwner) {
      throw new Error('Unauthorized: Only app owner can grant entitlements');
    }

    const expiry = durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const entitlement: Entitlement = {
      userId,
      tier,
      expiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await window.spark.kv.set(`entitlement:${userId}`, entitlement);
  }

  getProducts(): Product[] {
    return PRODUCTS;
  }

  async restorePurchases(): Promise<void> {
    if (!this.currentUser) {
      await this.initialize();
    }

    const entitlement = await window.spark.kv.get<Entitlement>(`entitlement:${this.currentUser!.id}`);
    
    if (!entitlement || entitlement.tier === 'free') {
      throw new Error('Geen eerdere aankopen gevonden');
    }

    const now = new Date();
    const expiryDate = entitlement.expiry ? new Date(entitlement.expiry) : null;
    const isActive = !expiryDate || expiryDate > now;

    if (!isActive) {
      throw new Error('Eerdere aankoop is verlopen');
    }

    return;
  }

  private validateReceipt(receipt: string): boolean {
    return receipt.startsWith('receipt_') && receipt.length > 10;
  }

  private async storeEntitlement(entitlement: Entitlement): Promise<void> {
    await window.spark.kv.set(`entitlement:${entitlement.userId}`, entitlement);

    const allEntitlements = await window.spark.kv.get<string[]>('entitlements:all') || [];
    if (!allEntitlements.includes(entitlement.userId)) {
      allEntitlements.push(entitlement.userId);
      await window.spark.kv.set('entitlements:all', allEntitlements);
    }
  }

  async generateJWT(entitlement: EntitlementStatus): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      tier: entitlement.tier,
      expiry: entitlement.expiry,
      isActive: entitlement.isActive,
      iat: Math.floor(Date.now() / 1000),
      exp: entitlement.expiry ? Math.floor(new Date(entitlement.expiry).getTime() / 1000) : null,
    };

    const base64Header = btoa(JSON.stringify(header));
    const base64Payload = btoa(JSON.stringify(payload));

    return `${base64Header}.${base64Payload}.simulated-signature`;
  }
}

export const licenseService = new LicenseService();
