import { kvStorage } from './kv-storage';
import { userCredentialsService } from './services/user-credentials-service';
import { BackendDeribitClient } from './deribit-client';

/**
 * UserBrokerRegistry
 * - Manages per-user broker clients
 * - Uses userCredentialsService to load decrypted credentials on connect
 * - Persists manual disconnect flags in kvStorage (keyed by userId)
 */
class UserBrokerRegistry {
  private clients: Map<string, BackendDeribitClient> = new Map();

  private kvManualDisconnectKey(userId: string, broker: string, environment: string) {
    return `user:${userId}:broker:${broker}:env:${environment}:manualDisconnect`;
  }

  /**
   * Connect a user's broker client using stored credentials
   */
  async connect(userId: string, broker: string = 'deribit', environment: 'testnet' | 'live' = 'testnet') {
    // Check manual disconnect flag - if user manually disconnected earlier, don't auto-connect
    const manualKey = this.kvManualDisconnectKey(userId, broker, environment);
    const manuallyDisconnected = await kvStorage.get(manualKey);
    if (manuallyDisconnected === 'true') {
      throw new Error('User manually disconnected - clear manual disconnect flag to reconnect');
    }

    // Load credentials
    const creds = await userCredentialsService.loadCredentials(userId, broker, environment);
    if (!creds) {
      throw new Error('No credentials found for user');
    }

    // Create client and connect
    const clientKey = `${userId}:${broker}:${environment}`;
    let client = this.clients.get(clientKey);
    if (!client) {
      client = new BackendDeribitClient(environment);
      this.clients.set(clientKey, client);
    }

    await client.connect({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });

    // Clear manual disconnect flag after successful connect
    await kvStorage.delete(manualKey);

    return true;
  }

  /**
   * Disconnect a user's broker client and set manual disconnect flag
   */
  async disconnect(userId: string, broker: string = 'deribit', environment: 'testnet' | 'live' = 'testnet') {
    const clientKey = `${userId}:${broker}:${environment}`;
    const client = this.clients.get(clientKey);
    const manualKey = this.kvManualDisconnectKey(userId, broker, environment);

    // Set manual disconnect so auto-reconnect won't trigger
    await kvStorage.set(manualKey, 'true');

    if (client) {
      client.disconnect();
      this.clients.delete(clientKey);
      return true;
    }

    // If there was no client, still record manual disconnect
    return false;
  }

  getClient(userId: string, broker: string = 'deribit', environment: 'testnet' | 'live' = 'testnet') {
    return this.clients.get(`${userId}:${broker}:${environment}`) || null;
  }

  getConnectionStatus(userId: string, broker: string = 'deribit', environment: 'testnet' | 'live' = 'testnet') {
    const client = this.getClient(userId, broker, environment);
    return {
      connected: client ? client.isConnected() : false,
      broker,
      environment,
      manuallyDisconnected: false, // caller can check kvStorage if needed
    };
  }
}

export const userBrokerRegistry = new UserBrokerRegistry();
