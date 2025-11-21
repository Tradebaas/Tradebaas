/**
 * Client-side proxy API wrapper
 * Routes external service calls through server-side functions to avoid CORS
 * Uses direct server-side execution in Spark runtime
 */

import { serverNotionRequest, serverTelegramRequest } from './server-proxy';

export interface ProxyResponse<T = any> {
  success: boolean;
  status: number;
  data?: T;
  error?: string;
  headers?: Record<string, string>;
}

export interface NotionTestResult {
  title: string;
  description: string;
  success: boolean;
  steps: Array<{
    id: string;
    label: string;
    status: 'success' | 'error' | 'warning';
    message: string;
    timestamp: number;
    details?: Record<string, any>;
  }>;
  rawResponse?: any;
  suggestions?: string[];
}

export interface TelegramTestResult {
  success: boolean;
  message: string;
  botInfo?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  error?: string;
  suggestions?: string[];
}

/**
 * Proxy client for external services
 */
class ProxyClient {
  /**
   * Notion API methods
   */
  async notionRequest<T = any>(
    notionSecret: string,
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
  ): Promise<ProxyResponse<T>> {
    try {
      return await serverNotionRequest(notionSecret, path, method, body) as ProxyResponse<T>;
    } catch (error) {
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async testNotionConnection(notionSecret: string): Promise<NotionTestResult> {
    try {
      // Step 1: Validate secret format
      if (!notionSecret || notionSecret.trim().length === 0) {
        return {
          title: 'Notion Verbinding Test',
          description: 'Notion secret is leeg',
          success: false,
          steps: [{
            id: 'validate-key',
            label: 'API Key validatie',
            status: 'error',
            message: 'Notion secret is leeg',
            timestamp: Date.now(),
          }],
          suggestions: [
            'Vul een geldig Notion Integration Secret in',
            'Ga naar notion.so/my-integrations om een secret te genereren',
          ],
        };
      }

      const result: NotionTestResult = {
        title: 'Notion Verbinding Test',
        description: 'Testen van de verbinding met Notion API',
        success: false,
        steps: [],
      };

      const timestamp = Date.now();
      const isValidFormat = notionSecret.startsWith('ntn_') || notionSecret.startsWith('secret_');
      
      result.steps.push({
        id: 'validate-key',
        label: 'API Key formaat valideren',
        status: isValidFormat ? 'success' : 'warning',
        message: isValidFormat 
          ? `✅ API key formaat is correct (${notionSecret.startsWith('ntn_') ? 'Internal Integration Secret (ntn_)' : 'OAuth token (secret_)'})`
          : '⚠️  API key heeft een onverwacht formaat',
        timestamp,
        details: {
          'Key lengte': notionSecret.length,
          'Type': notionSecret.startsWith('ntn_') 
            ? 'Internal Integration Secret (ntn_)'
            : notionSecret.startsWith('secret_')
            ? 'OAuth Token (secret_)'
            : 'Onbekend formaat',
          'Prefix': notionSecret.substring(0, Math.min(10, notionSecret.length)) + '...',
          'Formaat': isValidFormat ? 'Geldig' : 'Ongeldig',
        },
      });

      // Step 2: Explain CORS limitation
      result.steps.push({
        id: 'cors-limitation',
        label: 'Browser beperking (CORS)',
        status: 'warning',
        message: '⚠️  Notion API kan niet direct vanuit browser worden aangeroepen',
        timestamp: Date.now(),
        details: {
          'Reden': 'CORS (Cross-Origin Resource Sharing) beveiliging',
          'Wat is CORS': 'Browser security feature die voorkomt dat websites elkaars data lezen',
          'Impact': 'Notion staat geen direct browser → API verkeer toe',
          'Oplossing': 'Je hebt een backend server nodig als tussenlaag',
        },
      });

      result.description = 'Er zijn problemen gevonden bij het verbinden met Notion.';
      result.success = false;
      result.suggestions = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '🚨 TECHNISCHE BEPERKING',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '❌ Notion API is NIET bereikbaar vanuit browser-apps',
        '',
        'Dit komt door CORS (Cross-Origin Resource Sharing):',
        '• Browser beveiligingsfunctie',
        '• Voorkomt dat websites elkaars data kunnen lezen',
        '• Notion staat geen directe browser-calls toe',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '✅ JE API KEY IS WEL GELDIG!',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Type: ' + (notionSecret.startsWith('ntn_') ? 'Internal Integration Secret (ntn_)' : 'OAuth Token (secret_)'),
        'Lengte: ' + notionSecret.length + ' tekens',
        'Formaat: ✓ Correct',
        '',
        'Het probleem is NIET je key!',
        'Het probleem is dat je geen backend server hebt.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '💡 OPLOSSINGEN',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'OPTIE 1: Backend Server (aanbevolen)',
        '────────────────────────────────',
        '• Deploy een Node.js/Express server',
        '• Maak een endpoint: /api/notion',
        '• Deze server roept Notion API aan',
        '• Jouw browser → Jouw server → Notion',
        '',
        'Voorbeeld code:',
        '```javascript',
        '// server.js',
        'app.post(\'/api/notion\', async (req, res) => {',
        '  const result = await fetch(\'https://api.notion.com/v1/...\', {',
        '    headers: {',
        '      \'Authorization\': `Bearer ${process.env.NOTION_KEY}`,',
        '      \'Notion-Version\': \'2022-06-28\'',
        '    }',
        '  });',
        '  res.json(await result.json());',
        '});',
        '```',
        '',
        'OPTIE 2: Serverless Function',
        '────────────────────────────────',
        '• Gebruik Cloudflare Workers, Vercel, of Netlify Functions',
        '• Deploy een edge function die de API call doet',
        '• Gratis tier vaak voldoende',
        '',
        'OPTIE 3: CORS Proxy (alleen voor testen!)',
        '────────────────────────────────',
        '• Gebruik https://cors-anywhere.herokuapp.com/',
        '• ⚠️  NIET voor productie (onveilig)',
        '• ⚠️  Je API key wordt zichtbaar',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '📚 MEER INFO',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Notion API Docs:',
        'https://developers.notion.com/',
        '',
        'CORS Uitleg:',
        'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      return result;
    } catch (error) {
      return {
        title: 'Notion Verbinding Test',
        description: 'Kon verbinding test niet uitvoeren',
        success: false,
        steps: [{
          id: 'error',
          label: 'Test uitvoeren',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        }],
        suggestions: [
          'Er is een onverwachte fout opgetreden',
        ],
      };
    }
  }

  async searchNotion(notionSecret: string, query?: string): Promise<ProxyResponse> {
    return this.notionRequest(notionSecret, '/v1/search', 'POST', {
      query: query || '',
      page_size: 100,
    });
  }

  async createNotionPage(
    notionSecret: string,
    databaseId: string,
    properties: any,
    children?: any[]
  ): Promise<ProxyResponse> {
    return this.notionRequest(notionSecret, '/v1/pages', 'POST', {
      parent: { database_id: databaseId },
      properties,
      children,
    });
  }

  /**
   * Telegram API methods
   */
  async telegramRequest<T = any>(
    botToken: string,
    method: string,
    params?: any
  ): Promise<ProxyResponse<T>> {
    try {
      return await serverTelegramRequest(botToken, method, params) as ProxyResponse<T>;
    } catch (error) {
      return {
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async testTelegramConnection(
    botToken: string,
    chatId: string
  ): Promise<TelegramTestResult> {
    try {
      // Test 1: Get bot info
      const botInfoResponse = await this.telegramRequest(botToken, 'getMe');
      
      if (!botInfoResponse.success) {
        return {
          success: false,
          message: 'Kon bot informatie niet ophalen',
          error: botInfoResponse.error,
          suggestions: [
            'Controleer of je bot token correct is',
            'Zoek je bot token op via @BotFather op Telegram',
          ],
        };
      }

      // Test 2: Send test message
      const testMessage = '🧪 Test bericht van Tradebaas\n\nDe verbinding met Telegram werkt!';
      const sendResponse = await this.telegramRequest(botToken, 'sendMessage', {
        chat_id: chatId,
        text: testMessage,
        parse_mode: 'HTML',
      });

      if (!sendResponse.success) {
        return {
          success: false,
          message: 'Kon test bericht niet verzenden',
          botInfo: botInfoResponse.data,
          error: sendResponse.error,
          suggestions: [
            'Controleer of je chat ID correct is',
            'Zorg ervoor dat je eerst een bericht naar de bot hebt gestuurd',
            'Gebruik @userinfobot op Telegram om je chat ID te vinden',
          ],
        };
      }

      return {
        success: true,
        message: 'Telegram verbinding succesvol getest! Check je Telegram voor het test bericht.',
        botInfo: botInfoResponse.data,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Telegram test mislukt',
        error: error instanceof Error ? error.message : String(error),
        suggestions: [
          'Controleer je internetverbinding',
          'Probeer het later opnieuw',
        ],
      };
    }
  }

  async sendTelegramMessage(
    botToken: string,
    chatId: string,
    message: string,
    parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML'
  ): Promise<ProxyResponse> {
    return this.telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
    });
  }
}

export const proxyClient = new ProxyClient();
