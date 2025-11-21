import prisma from '../db/client';

export const logExchange = async (entry: { botId?: string; broker: string; requestPath: string; method: string; requestBody?: any; responseBody?: any; statusCode?: number }) => {
  try {
    await prisma.exchangeLog.create({ data: { botId: entry.botId || null, broker: entry.broker, requestPath: entry.requestPath, method: entry.method, requestBody: entry.requestBody ? JSON.stringify(entry.requestBody) : null, responseBody: entry.responseBody ? JSON.stringify(entry.responseBody) : null, statusCode: entry.statusCode || null } });
  } catch (e) {
    // safe: ignore logging failures
    console.warn('audit log failed', e);
  }
};

export default { logExchange };
