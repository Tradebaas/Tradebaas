/**
 * Generic Credentials Manager
 * Handles reading and writing credentials to .env file
 */

import fs from 'fs/promises';
import path from 'path';

export interface CredentialValue {
  key: string;
  value: string;
}

export interface SaveCredentialsRequest {
  service: string; // e.g., 'deribit', 'telegram', 'notion'
  credentials: CredentialValue[];
}

export interface GetCredentialsResponse {
  success: boolean;
  message?: string;
  credentials?: Record<string, string>;
}

export class CredentialsManager {
  private envPath: string;

  constructor(envPath?: string) {
    this.envPath = envPath || path.join(__dirname, '../../.env');
  }

  /**
   * Get credentials for a service
   */
  async getCredentials(service: string): Promise<GetCredentialsResponse> {
    console.log(`[CredentialsManager] Get credentials for: ${service}`);
    
    const serviceUpper = service.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    
    // Try to find all env vars that match the service prefix
    const credentials: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(serviceUpper + '_')) {
        // Extract the credential name (e.g., DERIBIT_API_KEY -> API_KEY)
        const credName = key.substring(serviceUpper.length + 1).toLowerCase();
        
        // Skip if it's a placeholder value
        if (value && !value.includes('your_') && !value.includes('_here')) {
          credentials[credName] = value;
        }
      }
    }
    
    if (Object.keys(credentials).length === 0) {
      return {
        success: false,
        message: 'Geen credentials gevonden',
        credentials: undefined,
      };
    }
    
    return {
      success: true,
      credentials,
    };
  }

  /**
   * Save credentials for a service
   */
  async saveCredentials(request: SaveCredentialsRequest): Promise<GetCredentialsResponse> {
    const { service, credentials } = request;
    
    console.log(`[CredentialsManager] Save credentials for: ${service}`);
    
    if (!credentials || credentials.length === 0) {
      return {
        success: false,
        message: 'Geen credentials opgegeven',
      };
    }
    
    try {
      // Read current .env file
      let envContent = '';
      try {
        envContent = await fs.readFile(this.envPath, 'utf-8');
      } catch (error) {
        console.log('[CredentialsManager] No .env file found, creating new one');
      }
      
      // Parse existing env vars into sections
      const sections = this.parseEnvFile(envContent);
      
      // Update credentials for this service
      const serviceUpper = service.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const serviceName = this.formatServiceName(service);
      
      if (!sections.has(serviceName)) {
        sections.set(serviceName, new Map());
      }
      
      const serviceSection = sections.get(serviceName)!;
      
      // Add/update credentials
      for (const { key, value } of credentials) {
        const envKey = `${serviceUpper}_${key.toUpperCase()}`;
        serviceSection.set(envKey, value);
        
        // Update runtime process.env
        process.env[envKey] = value;
      }
      
      // Rebuild .env content
      const newContent = this.buildEnvFile(sections);
      
      // Write back to .env
      await fs.writeFile(this.envPath, newContent, 'utf-8');
      
      console.log(`[CredentialsManager] Successfully saved credentials for ${service}`);
      
      return {
        success: true,
        message: 'Credentials opgeslagen',
      };
    } catch (error: any) {
      console.error('[CredentialsManager] Error saving:', error);
      return {
        success: false,
        message: `Fout bij opslaan: ${error.message}`,
      };
    }
  }

  /**
   * Delete credentials for a service
   */
  async deleteCredentials(service: string): Promise<GetCredentialsResponse> {
    console.log(`[CredentialsManager] Delete credentials for: ${service}`);
    
    try {
      const envContent = await fs.readFile(this.envPath, 'utf-8');
      const sections = this.parseEnvFile(envContent);
      
      const serviceName = this.formatServiceName(service);
      
      if (!sections.has(serviceName)) {
        return {
          success: false,
          message: 'Service niet gevonden',
        };
      }
      
      // Remove the section
      sections.delete(serviceName);
      
      // Rebuild and write
      const newContent = this.buildEnvFile(sections);
      await fs.writeFile(this.envPath, newContent, 'utf-8');
      
      // Clear from runtime
      const serviceUpper = service.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      for (const key of Object.keys(process.env)) {
        if (key.startsWith(serviceUpper + '_')) {
          delete process.env[key];
        }
      }
      
      console.log(`[CredentialsManager] Successfully deleted credentials for ${service}`);
      
      return {
        success: true,
        message: 'Credentials verwijderd',
      };
    } catch (error: any) {
      console.error('[CredentialsManager] Error deleting:', error);
      return {
        success: false,
        message: `Fout bij verwijderen: ${error.message}`,
      };
    }
  }

  /**
   * Parse .env file into sections
   */
  private parseEnvFile(content: string): Map<string, Map<string, string>> {
    const sections = new Map<string, Map<string, string>>();
    let currentSection = 'General';
    
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect section headers (comments ending with "Credentials" or "Configuration")
      if (trimmed.startsWith('#') && (trimmed.includes('Credentials') || trimmed.includes('Configuration'))) {
        // Extract service name from comment
        const match = trimmed.match(/# ([A-Za-z0-9\s.]+?) (?:API )?(?:Credentials|Configuration)/i);
        if (match) {
          currentSection = match[1].trim();
          if (!sections.has(currentSection)) {
            sections.set(currentSection, new Map());
          }
        }
        continue;
      }
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Parse key=value
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        if (!sections.has(currentSection)) {
          sections.set(currentSection, new Map());
        }
        sections.get(currentSection)!.set(key.trim(), valueParts.join('=').trim());
      }
    }
    
    return sections;
  }

  /**
   * Build .env file content from sections
   */
  private buildEnvFile(sections: Map<string, Map<string, string>>): string {
    let content = '';
    
    for (const [sectionName, vars] of sections.entries()) {
      if (vars.size === 0) continue;
      
      // Add section header
      const headerSuffix = sectionName.toLowerCase().includes('telegram') || 
                          sectionName.toLowerCase().includes('notion') 
                          ? 'Configuration' 
                          : 'API Credentials';
      
      content += `# ${sectionName} ${headerSuffix}\n`;
      
      // Add variables
      for (const [key, value] of vars.entries()) {
        content += `${key}=${value}\n`;
      }
      
      content += '\n';
    }
    
    return content;
  }

  /**
   * Format service name for display
   */
  private formatServiceName(service: string): string {
    // Map common service names to proper display names
    const nameMap: Record<string, string> = {
      'deribit': 'Deribit',
      'binance': 'Binance',
      'bybit': 'Bybit',
      'okx': 'OKX',
      'kraken': 'Kraken',
      'bitget': 'Bitget',
      'kucoin': 'KuCoin',
      'mexc': 'MEXC',
      'gateio': 'Gate.io',
      'bitmex': 'BitMEX',
      'huobi': 'Huobi',
      'phemex': 'Phemex',
      'coinbase': 'Coinbase Advanced',
      'bitstamp': 'Bitstamp',
      'bitfinex': 'Bitfinex',
      'telegram': 'Telegram',
      'notion': 'Notion',
      'discord': 'Discord',
      'slack': 'Slack',
    };
    
    return nameMap[service.toLowerCase()] || service.charAt(0).toUpperCase() + service.slice(1);
  }
}

// Singleton instance
export const credentialsManager = new CredentialsManager();
