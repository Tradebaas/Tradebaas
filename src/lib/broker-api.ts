export interface BrokerMetadata {
  name: string;
  logoURL: string;
  maxLeverage: number;
  baseCurrencies: string[];
  supportedPairs: string[];
  hasTestnet: boolean;
  apiDocsURL: string;
}

export interface BrokersResponse {
  success: boolean;
  data: BrokerMetadata[];
  timestamp: number;
}

interface DeribitInstrument {
  instrument_name: string;
  tick_size: number;
  min_trade_amount: number;
  max_leverage: number;
  contract_size: number;
  settlement_period: string;
  settlement_currency: string;
  kind: string;
  quote_currency: string;
  is_active: boolean;
  base_currency: string;
}

const DERIBIT_API_BASE = 'https://www.deribit.com/api/v2';

async function fetchDeribitInstruments(): Promise<DeribitInstrument[]> {
  try {
    const response = await fetch(`${DERIBIT_API_BASE}/public/get_instruments?currency=any&kind=future`);
    const data = await response.json();
    
    if (data.result) {
      return data.result.filter((inst: DeribitInstrument) => inst.is_active);
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch Deribit instruments:', error);
    return [];
  }
}

export async function getBrokers(): Promise<BrokersResponse> {
  const deribitInstruments = await fetchDeribitInstruments();
  
  const deribitPairs = deribitInstruments
    .filter(inst => inst.kind === 'future' || inst.settlement_period === 'perpetual')
    .map(inst => inst.instrument_name)
    .slice(0, 20);

  const deribitBaseCurrencies = Array.from(
    new Set(deribitInstruments.map(inst => inst.base_currency))
  ).filter(Boolean);

  const brokers: BrokerMetadata[] = [
    {
      name: 'Deribit',
      logoURL: 'https://deribit.com/favicon.ico',
      maxLeverage: 50,
      baseCurrencies: deribitBaseCurrencies.length > 0 ? deribitBaseCurrencies : ['BTC', 'ETH', 'SOL', 'USDC'],
      supportedPairs: deribitPairs.length > 0 ? deribitPairs : ['BTC-PERPETUAL', 'ETH-PERPETUAL', 'BTC_USDC-PERPETUAL', 'ETH_USDC-PERPETUAL'],
      hasTestnet: true,
      apiDocsURL: 'https://docs.deribit.com',
    },
    {
      name: 'Binance',
      logoURL: 'https://bin.bnbstatic.com/static/images/common/favicon.ico',
      maxLeverage: 125,
      baseCurrencies: ['USDT', 'BUSD', 'BTC', 'ETH'],
      supportedPairs: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT'],
      hasTestnet: true,
      apiDocsURL: 'https://binance-docs.github.io/apidocs/futures/en/',
    },
    {
      name: 'Bybit',
      logoURL: 'https://www.bybit.com/favicon.ico',
      maxLeverage: 100,
      baseCurrencies: ['USDT', 'USDC', 'BTC', 'ETH'],
      supportedPairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT', 'LINKUSDT'],
      hasTestnet: true,
      apiDocsURL: 'https://bybit-exchange.github.io/docs/v5/intro',
    },
    {
      name: 'OKX',
      logoURL: 'https://www.okx.com/favicon.ico',
      maxLeverage: 125,
      baseCurrencies: ['USDT', 'USDC', 'BTC', 'ETH'],
      supportedPairs: ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP', 'XRP-USDT-SWAP', 'ADA-USDT-SWAP', 'DOGE-USDT-SWAP', 'DOT-USDT-SWAP', 'MATIC-USDT-SWAP', 'AVAX-USDT-SWAP', 'LINK-USDT-SWAP'],
      hasTestnet: true,
      apiDocsURL: 'https://www.okx.com/docs-v5/en/',
    },
    {
      name: 'Kraken',
      logoURL: 'https://www.kraken.com/favicon.ico',
      maxLeverage: 5,
      baseCurrencies: ['USD', 'EUR', 'BTC', 'ETH'],
      supportedPairs: ['PF_XBTUSD', 'PF_ETHUSD', 'PF_SOLUSD', 'PF_XRPUSD', 'PF_ADAUSD', 'PF_DOTUSD', 'PF_MATICUSD', 'PF_AVAXUSD', 'PF_LINKUSD'],
      hasTestnet: false,
      apiDocsURL: 'https://docs.kraken.com/rest/',
    },
    {
      name: 'Bitget',
      logoURL: 'https://www.bitget.com/favicon.ico',
      maxLeverage: 125,
      baseCurrencies: ['USDT', 'USDC', 'BTC', 'ETH'],
      supportedPairs: ['BTCUSDT_UMCBL', 'ETHUSDT_UMCBL', 'SOLUSDT_UMCBL', 'XRPUSDT_UMCBL', 'ADAUSDT_UMCBL', 'DOGEUSDT_UMCBL', 'DOTUSDT_UMCBL', 'MATICUSDT_UMCBL', 'AVAXUSDT_UMCBL', 'LINKUSDT_UMCBL'],
      hasTestnet: false,
      apiDocsURL: 'https://www.bitget.com/api-doc/contract/intro',
    },
    {
      name: 'KuCoin',
      logoURL: 'https://www.kucoin.com/favicon.ico',
      maxLeverage: 100,
      baseCurrencies: ['USDT', 'BTC', 'ETH'],
      supportedPairs: ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'XRPUSDTM', 'ADAUSDTM', 'DOGEUSDTM', 'DOTUSDTM', 'MATICUSDTM', 'AVAXUSDTM', 'LINKUSDTM'],
      hasTestnet: true,
      apiDocsURL: 'https://docs.kucoin.com/futures/',
    },
    {
      name: 'MEXC',
      logoURL: 'https://www.mexc.com/favicon.ico',
      maxLeverage: 200,
      baseCurrencies: ['USDT', 'USDC', 'BTC'],
      supportedPairs: ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'XRP_USDT', 'ADA_USDT', 'DOGE_USDT', 'DOT_USDT', 'MATIC_USDT', 'AVAX_USDT', 'LINK_USDT'],
      hasTestnet: false,
      apiDocsURL: 'https://mexcdevelop.github.io/apidocs/contract_v1_en/',
    },
    {
      name: 'Gate.io',
      logoURL: 'https://www.gate.io/favicon.ico',
      maxLeverage: 100,
      baseCurrencies: ['USDT', 'BTC', 'ETH'],
      supportedPairs: ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'XRP_USDT', 'ADA_USDT', 'DOGE_USDT', 'DOT_USDT', 'MATIC_USDT', 'AVAX_USDT', 'LINK_USDT'],
      hasTestnet: true,
      apiDocsURL: 'https://www.gate.io/docs/developers/apiv4/en/',
    },
    {
      name: 'BitMEX',
      logoURL: 'https://www.bitmex.com/favicon.ico',
      maxLeverage: 100,
      baseCurrencies: ['USD', 'USDT', 'BTC'],
      supportedPairs: ['XBTUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'AVAXUSD', 'LINKUSD'],
      hasTestnet: true,
      apiDocsURL: 'https://www.bitmex.com/api/explorer/',
    },
    {
      name: 'Huobi',
      logoURL: 'https://www.huobi.com/favicon.ico',
      maxLeverage: 125,
      baseCurrencies: ['USDT', 'BTC', 'ETH'],
      supportedPairs: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'ADA-USDT', 'DOGE-USDT', 'DOT-USDT', 'MATIC-USDT', 'AVAX-USDT', 'LINK-USDT'],
      hasTestnet: false,
      apiDocsURL: 'https://huobiapi.github.io/docs/usdt_swap/v1/en/',
    },
    {
      name: 'Phemex',
      logoURL: 'https://phemex.com/favicon.ico',
      maxLeverage: 100,
      baseCurrencies: ['USD', 'USDT', 'BTC'],
      supportedPairs: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'AVAXUSD', 'LINKUSD'],
      hasTestnet: true,
      apiDocsURL: 'https://github.com/phemex/phemex-api-docs',
    },
    {
      name: 'Coinbase Advanced',
      logoURL: 'https://www.coinbase.com/favicon.ico',
      maxLeverage: 5,
      baseCurrencies: ['USD', 'EUR', 'GBP'],
      supportedPairs: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD', 'DOT-USD', 'MATIC-USD', 'AVAX-USD', 'LINK-USD'],
      hasTestnet: false,
      apiDocsURL: 'https://docs.cloud.coinbase.com/advanced-trade-api/docs/welcome',
    },
    {
      name: 'Bitstamp',
      logoURL: 'https://www.bitstamp.net/favicon.ico',
      maxLeverage: 3,
      baseCurrencies: ['USD', 'EUR'],
      supportedPairs: ['btcusd', 'ethusd', 'solusd', 'xrpusd', 'adausd', 'linkusd', 'dotusd', 'maticusd', 'avaxusd'],
      hasTestnet: false,
      apiDocsURL: 'https://www.bitstamp.net/api/',
    },
    {
      name: 'Bitfinex',
      logoURL: 'https://www.bitfinex.com/favicon.ico',
      maxLeverage: 10,
      baseCurrencies: ['USD', 'USDT', 'EUR'],
      supportedPairs: ['tBTCUSD', 'tETHUSD', 'tSOLUSD', 'tXRPUSD', 'tADAUSD', 'tDOGEUSD', 'tDOTUSD', 'tMATICUSD', 'tAVAXUSD', 'tLINKUSD'],
      hasTestnet: false,
      apiDocsURL: 'https://docs.bitfinex.com/docs',
    },
  ];

  return {
    success: true,
    data: brokers,
    timestamp: Date.now(),
  };
}
