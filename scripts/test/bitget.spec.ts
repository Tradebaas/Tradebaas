import { describe, it, expect } from 'vitest';
import { BitgetAdapter } from '../src/adapters/bitget';

describe('BitgetAdapter', () => {
  it('computes HMAC SHA256 base64 signature correctly via signFor', () => {
    const adapter = new BitgetAdapter();
    // set a known secret and prehash
    (adapter as any).secret = 'testsecret';
    const prehash = '1650000000000POST/api/mix/v1/order/placeOrder{"foo":"bar"}';

    // compute expected using Node crypto in test to avoid hardcoding
    const crypto = require('crypto');
    const expected = Buffer.from(crypto.createHmac('sha256', 'testsecret').update(prehash).digest()).toString('base64');

    const sig = adapter.signFor(prehash);
    expect(sig).toBe(expected);
  });

  it('placeOrder in dry-run returns a Trade-like object without calling external API', async () => {
    const adapter = new BitgetAdapter();
    // force dry-run
    (adapter as any).apiKey = '';
    (adapter as any).secret = '';
    (adapter as any).passphrase = '';
    (adapter as any).dryRun = true;

    const signal = {
      id: 'sig-1',
      botId: 'bot-1',
      instrument: 'BTCUSDC',
      side: 'buy',
      size: 12,
      timestamp: Date.now()
    } as any;

    const trade = await adapter.placeOrder(signal);
    expect(trade).toBeDefined();
    expect(trade.botId).toBe('bot-1');
    expect(trade.instrument).toBe('BTCUSDC');
    expect(trade.size).toBe(12);
    expect(trade.status).toBe('open');
  });
});
