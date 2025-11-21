/**
 * Backend Status Client
 * Polls backend for connection status instead of maintaining client-side connection
 */

import { getBackendUrl } from './backend-url';

const BACKEND_URL = getBackendUrl();

export interface BackendStatus {
  connected: boolean;
  environment: 'live' | 'testnet';
  broker?: string;
}

export async function getBackendStatus(): Promise<BackendStatus> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/strategy/status`);
    const data = await response.json();
    
    return {
      connected: data.connection?.connected || false,
      environment: data.connection?.environment || 'testnet',
      broker: data.connection?.broker || 'deribit',
    };
  } catch (error) {
    console.error('[BackendStatus] Failed to fetch status:', error);
    return {
      connected: false,
      environment: 'testnet',
    };
  }
}

export async function connectBackend(apiKey: string, apiSecret: string, environment: 'live' | 'testnet'): Promise<{ success: boolean; error?: string }> {
  try {
    // Save credentials to backend
    const credResponse = await fetch(`${BACKEND_URL}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'deribit',
        credentials: { apiKey, apiSecret },
      }),
    });
    
    if (!credResponse.ok) {
      return { success: false, error: 'Failed to save credentials' };
    }
    
    // Backend will auto-connect with saved credentials
    // Wait a bit for reconnection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const status = await getBackendStatus();
    
    if (status.connected) {
      return { success: true };
    } else {
      return { success: false, error: 'Connection failed' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function disconnectBackend(): Promise<{ success: boolean }> {
  try {
    // Use the v2 disconnect endpoint to properly set manuallyDisconnected flag
    const response = await fetch(`${BACKEND_URL}/api/v2/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('[BackendStatus] Disconnect failed:', response.statusText);
      return { success: false };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[BackendStatus] Disconnect error:', error);
    return { success: false };
  }
}
