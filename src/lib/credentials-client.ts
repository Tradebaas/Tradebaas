/**
 * Frontend Credentials Client
 * Helper functions to interact with backend credentials API
 */

import { getBackendUrl } from './backend-url';

export interface CredentialValue {
  key: string;
  value: string;
}

export interface SaveCredentialsRequest {
  service: string;
  credentials: CredentialValue[];
}

export interface GetCredentialsResponse {
  success: boolean;
  message?: string;
  credentials?: Record<string, string>;
}

class CredentialsClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getBackendUrl();
  }

  /**
   * Get credentials for a service
   */
  async get(service: string): Promise<GetCredentialsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/credentials/${service}`);
      return await response.json();
    } catch (error) {
      console.error(`[CredentialsClient] Failed to get credentials for ${service}:`, error);
      return {
        success: false,
        message: 'Netwerkfout',
      };
    }
  }

  /**
   * Save credentials for a service
   */
  async save(request: SaveCredentialsRequest): Promise<GetCredentialsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      return await response.json();
    } catch (error) {
      console.error(`[CredentialsClient] Failed to save credentials for ${request.service}:`, error);
      return {
        success: false,
        message: 'Netwerkfout',
      };
    }
  }

  /**
   * Delete credentials for a service
   */
  async delete(service: string): Promise<GetCredentialsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/credentials/${service}`, {
        method: 'DELETE',
      });
      return await response.json();
    } catch (error) {
      console.error(`[CredentialsClient] Failed to delete credentials for ${service}:`, error);
      return {
        success: false,
        message: 'Netwerkfout',
      };
    }
  }

  /**
   * Save Telegram credentials
   */
  async saveTelegram(botToken: string, chatId: string): Promise<GetCredentialsResponse> {
    return this.save({
      service: 'telegram',
      credentials: [
        { key: 'bot_token', value: botToken },
        { key: 'chat_id', value: chatId },
      ],
    });
  }

  /**
   * Get Telegram credentials
   */
  async getTelegram(): Promise<{ botToken?: string; chatId?: string }> {
    const response = await this.get('telegram');
    if (response.success && response.credentials) {
      return {
        botToken: response.credentials.bot_token,
        chatId: response.credentials.chat_id,
      };
    }
    return {};
  }

  /**
   * Save Notion credentials
   */
  async saveNotion(apiKey: string, databaseId?: string): Promise<GetCredentialsResponse> {
    const credentials: CredentialValue[] = [
      { key: 'api_key', value: apiKey },
    ];
    
    if (databaseId) {
      credentials.push({ key: 'database_id', value: databaseId });
    }
    
    return this.save({
      service: 'notion',
      credentials,
    });
  }

  /**
   * Get Notion credentials
   */
  async getNotion(): Promise<{ apiKey?: string; databaseId?: string }> {
    const response = await this.get('notion');
    if (response.success && response.credentials) {
      return {
        apiKey: response.credentials.api_key,
        databaseId: response.credentials.database_id,
      };
    }
    return {};
  }

  /**
   * Save Discord credentials
   */
  async saveDiscord(webhookUrl: string): Promise<GetCredentialsResponse> {
    return this.save({
      service: 'discord',
      credentials: [
        { key: 'webhook_url', value: webhookUrl },
      ],
    });
  }

  /**
   * Get Discord credentials
   */
  async getDiscord(): Promise<{ webhookUrl?: string }> {
    const response = await this.get('discord');
    if (response.success && response.credentials) {
      return {
        webhookUrl: response.credentials.webhook_url,
      };
    }
    return {};
  }
}

export const credentialsClient = new CredentialsClient();
