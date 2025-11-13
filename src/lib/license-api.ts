import { licenseService, VerifyReceiptRequest, VerifyReceiptResponse, EntitlementStatus } from '@/lib/license-service';

export class LicenseAPI {
  private static baseURL = '/api/license';

  static async signInWithApple(appleToken: string): Promise<{ success: boolean; userId: string; error?: string }> {
    try {
      const user = await licenseService.signInWithApple(appleToken);
      return { success: true, userId: user.id };
    } catch (error) {
      return {
        success: false,
        userId: '',
        error: error instanceof Error ? error.message : 'Sign-in failed',
      };
    }
  }

  static async verifyReceipt(request: VerifyReceiptRequest): Promise<VerifyReceiptResponse> {
    try {
      return await licenseService.verifyReceipt(request);
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  static async getEntitlement(): Promise<EntitlementStatus> {
    try {
      return await licenseService.getEntitlement();
    } catch (error) {
      return {
        tier: 'free',
        expiry: null,
        isActive: true,
        daysRemaining: null,
      };
    }
  }

  static async handleWebhook(notification: any): Promise<{ success: boolean; error?: string }> {
    try {
      await licenseService.handleWebhook(notification);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      };
    }
  }

  static async getJWT(): Promise<string | null> {
    try {
      const entitlement = await licenseService.getEntitlement();
      return await licenseService.generateJWT(entitlement);
    } catch (error) {
      return null;
    }
  }
}

export const licenseAPI = LicenseAPI;
