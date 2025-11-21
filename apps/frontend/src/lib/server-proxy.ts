/**
 * Server-side proxy using Spark's global API
 * This file contains server-side logic that runs in the Spark runtime
 */

declare global {
  interface Window {
    sparkServerProxy?: {
      notionRequest: (secret: string, path: string, method: string, body?: any) => Promise<any>;
      telegramRequest: (botToken: string, method: string, params?: any) => Promise<any>;
    };
  }
}

const NOTION_VERSION = '2022-06-28';
const TELEGRAM_BASE_URL = 'https://api.telegram.org';
const NOTION_BASE_URL = 'https://api.notion.com';

/**
 * Server-side Notion API proxy
 * Runs in Spark's server context to avoid CORS
 */
export async function serverNotionRequest(
  notionSecret: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any
): Promise<{
  success: boolean;
  status: number;
  data?: any;
  error?: string;
}> {
  try {
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
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Server-side Telegram API proxy
 * Runs in Spark's server context to avoid CORS
 */
export async function serverTelegramRequest(
  botToken: string,
  method: string,
  params?: any
): Promise<{
  success: boolean;
  status: number;
  data?: any;
  error?: string;
}> {
  try {
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
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Initialize server-side proxy on the window object
 * This makes it available to the client-side code
 */
if (typeof window !== 'undefined') {
  window.sparkServerProxy = {
    notionRequest: (secret, path, method, body) => serverNotionRequest(secret, path, method as any, body),
    telegramRequest: serverTelegramRequest,
  };
}
