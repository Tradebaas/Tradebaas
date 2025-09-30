import type { Strategy } from '@/components';

export const BASE_STRATEGIES: Strategy[] = [
  {
    id: 'scalping',
    name: 'USDC Futures Scalping',
    description:
      'High-frequency BTC/ETH USDC perpetuals trading strategy focusing on small price movements with tight stop losses and quick profit taking.'
  },
  {
    id: 'trend-following',
    name: 'Futures Trend Following',
    description:
      'Multi-timeframe USDC futures strategy for BTC/ETH/SOL that identifies and follows strong market trends with dynamic position sizing.'
  },
  {
    id: 'volatility-arbitrage',
    name: 'Volatility Arbitrage',
    description:
      'Cross-contract USDC futures strategy that exploits volatility discrepancies between different cryptocurrency derivatives.'
  }
];

export function mergeStrategies(base: Strategy[], custom: Strategy[]): Strategy[] {
  const map = new Map<string, Strategy>();
  base.forEach((strategy) => {
    if (strategy?.id) {
      map.set(strategy.id, strategy);
    }
  });
  custom.forEach((strategy) => {
    if (strategy?.id) {
      map.set(strategy.id, strategy);
    }
  });
  return Array.from(map.values());
}
