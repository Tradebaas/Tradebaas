/**
 * Proxy API for external services
 * Handles Notion, Telegram, and other third-party API calls server-side
 * to avoid CORS issues and protect API keys
 */

export interface ProxyRequest {
  service: 'notion' | 'telegram';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: any;
  headers?: Record<string, string>;
}

export interface ProxyResponse {
  success: boolean;
  status: number;
  data?: any;
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

const NOTION_VERSION = '2022-06-28';
const TELEGRAM_BASE_URL = 'https://api.telegram.org';
const NOTION_BASE_URL = 'https://api.notion.com';

/**
 * Proxy request to Notion API
 */
export async function proxyNotionRequest(
  notionSecret: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any
): Promise<ProxyResponse> {
  try {
    if (!notionSecret) {
      return {
        success: false,
        status: 400,
        error: 'Notion secret is required',
      };
    }

    const url = `${NOTION_BASE_URL}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${notionSecret}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: ['GET', 'DELETE'].includes(method) ? undefined : JSON.stringify(body || {}),
    });

    const responseText = await response.text();
    let data: any;
    
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    return {
      success: response.ok,
      status: response.status,
      data,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test Notion connection with detailed diagnostics
 */
export async function testNotionConnection(notionSecret: string): Promise<NotionTestResult> {
  const result: NotionTestResult = {
    title: 'Notion Verbinding Test',
    description: 'Testen van de verbinding met Notion API',
    success: false,
    steps: [],
  };

  const timestamp = Date.now();

  // Step 1: Validate secret format
  if (!notionSecret || notionSecret.trim().length === 0) {
    result.steps.push({
      id: 'validate-key',
      label: 'API Key validatie',
      status: 'error',
      message: 'Notion secret is leeg',
      timestamp,
      details: {
        'Secret lengte': 0,
      },
    });
    result.suggestions = [
      'Vul een geldig Notion Integration Secret in',
      'Ga naar notion.so/my-integrations om een secret te genereren',
    ];
    return result;
  }

  // Validate secret format (should start with ntn_ or secret_)
  const isValidFormat = notionSecret.startsWith('ntn_') || notionSecret.startsWith('secret_');
  
  result.steps.push({
    id: 'validate-key',
    label: 'API Key formaat valideren',
    status: isValidFormat ? 'success' : 'warning',
    message: isValidFormat 
      ? `✅ API key formaat is correct (${notionSecret.startsWith('ntn_') ? 'Internal Integration Secret' : 'OAuth token'})`
      : '⚠️  API key heeft een onverwacht formaat (verwacht: ntn_ of secret_)',
    timestamp,
    details: {
      'Key lengte': notionSecret.length,
      'Type': notionSecret.startsWith('ntn_') 
        ? 'Internal Integration Secret (ntn_)'
        : notionSecret.startsWith('secret_')
        ? 'OAuth Token (secret_)'
        : 'Onbekend formaat',
      'Prefix': notionSecret.substring(0, 4),
      'Formaat': isValidFormat ? 'Geldig' : 'Mogelijk ongeldig',
    },
  });

  // Step 2: Test network connectivity to Notion API
  try {
    const response = await proxyNotionRequest(notionSecret, '/v1/users/me', 'GET');

    result.rawResponse = response.data;

    if (response.success && response.status === 200) {
      result.steps.push({
        id: 'network-test',
        label: 'Netwerkverbinding testen',
        status: 'success',
        message: '✅ Succesvol verbonden met Notion API',
        timestamp: Date.now(),
        details: {
          'HTTP Status': response.status,
          'Response type': typeof response.data,
        },
      });

      // Step 3: Validate API response
      if (response.data && response.data.object === 'user') {
        result.steps.push({
          id: 'validate-response',
          label: 'API response valideren',
          status: 'success',
          message: `✅ Notion gebruiker gevonden: ${response.data.name || response.data.id}`,
          timestamp: Date.now(),
          details: {
            'User ID': response.data.id,
            'User type': response.data.type,
            'Bot': response.data.bot ? 'Ja' : 'Nee',
          },
        });

        result.success = true;
        result.description = 'Verbinding met Notion is succesvol!';
        result.suggestions = [
          'Je kunt nu je database ID configureren',
          'Vergeet niet om je integratie toegang te geven tot de database via "Share"',
        ];
      } else {
        result.steps.push({
          id: 'validate-response',
          label: 'API response valideren',
          status: 'warning',
          message: '⚠️  Onverwachte API response structuur',
          timestamp: Date.now(),
          details: {
            'Response': JSON.stringify(response.data).substring(0, 200),
          },
        });
      }
    } else if (response.status === 401) {
      result.steps.push({
        id: 'network-test',
        label: 'Netwerkverbinding testen',
        status: 'error',
        message: '❌ Authenticatie mislukt - Notion secret is ongeldig',
        timestamp: Date.now(),
        details: {
          'HTTP Status': response.status,
          'Error': response.error || 'Unauthorized',
        },
      });
      result.suggestions = [
        'Controleer of je Notion Integration Secret correct is',
        'Ga naar notion.so/my-integrations en genereer eventueel een nieuwe secret',
        'Zorg ervoor dat je de volledige secret hebt gekopieerd (begint met ntn_)',
      ];
    } else {
      result.steps.push({
        id: 'network-test',
        label: 'Netwerkverbinding testen',
        status: 'error',
        message: `❌ Notion API fout: ${response.status}`,
        timestamp: Date.now(),
        details: {
          'HTTP Status': response.status,
          'Error': response.error || 'Onbekende fout',
        },
      });
      result.suggestions = [
        'Controleer of de Notion API bereikbaar is',
        'Probeer het later opnieuw',
      ];
    }
  } catch (error) {
    result.steps.push({
      id: 'network-test',
      label: 'Netwerkverbinding testen',
      status: 'error',
      message: 'Kan geen verbinding maken met Notion API',
      timestamp: Date.now(),
      details: {
        'Error type': error instanceof Error ? error.constructor.name : 'Unknown',
        'Error message': error instanceof Error ? error.message : String(error),
      },
    });
    result.suggestions = [
      'Controleer je internetverbinding',
      'Controleer of je firewall/antivirus Notion API niet blokkeert',
    ];
  }

  if (result.steps.length > 0) {
    const hasError = result.steps.some(step => step.status === 'error');
    if (hasError) {
      result.description = 'Er zijn problemen gevonden bij het verbinden met Notion.';
    }
  }

  return result;
}

/**
 * Proxy request to Telegram API
 */
export async function proxyTelegramRequest(
  botToken: string,
  method: string,
  params?: any
): Promise<ProxyResponse> {
  try {
    if (!botToken) {
      return {
        success: false,
        status: 400,
        error: 'Bot token is required',
      };
    }

    const url = `${TELEGRAM_BASE_URL}/bot${botToken}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params || {}),
    });

    const data = await response.json();

    return {
      success: response.ok && data.ok,
      status: response.status,
      data: data.result,
      error: data.description,
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test Telegram connection
 */
export async function testTelegramConnection(
  botToken: string,
  chatId: string
): Promise<TelegramTestResult> {
  try {
    // Test 1: Get bot info
    const botInfoResponse = await proxyTelegramRequest(botToken, 'getMe');
    
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
    const sendResponse = await proxyTelegramRequest(botToken, 'sendMessage', {
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

/**
 * Send Telegram message (for notifications)
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML'
): Promise<ProxyResponse> {
  return proxyTelegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: parseMode,
  });
}

/**
 * Search Notion database (example usage)
 */
export async function searchNotion(
  notionSecret: string,
  query?: string,
  filter?: any
): Promise<ProxyResponse> {
  return proxyNotionRequest(notionSecret, '/v1/search', 'POST', {
    query: query || '',
    filter: filter || {},
    page_size: 100,
  });
}

/**
 * Create Notion page (for logging trades)
 */
export async function createNotionPage(
  notionSecret: string,
  databaseId: string,
  properties: any,
  children?: any[]
): Promise<ProxyResponse> {
  return proxyNotionRequest(notionSecret, '/v1/pages', 'POST', {
    parent: { database_id: databaseId },
    properties,
    children,
  });
}

/**
 * Generic proxy handler - routes requests to appropriate service
 */
export async function handleProxyRequest(request: ProxyRequest): Promise<ProxyResponse> {
  switch (request.service) {
    case 'notion':
      return proxyNotionRequest(
        request.headers?.['Authorization']?.replace('Bearer ', '') || '',
        request.path,
        request.method,
        request.body
      );
    
    case 'telegram':
      // Extract bot token from path or headers
      const botToken = request.headers?.['X-Telegram-Bot-Token'] || '';
      const method = request.path.replace('/bot', '').split('/')[1];
      return proxyTelegramRequest(botToken, method, request.body);
    
    default:
      return {
        success: false,
        status: 400,
        error: `Unknown service: ${request.service}`,
      };
  }
}
