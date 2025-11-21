export const metrics = {
  botsRegistered: 0,
  signalsIngested: 0,
  tradesExecuted: 0,
  openTrades: 0,
  lastError: '' as string | null,
};

export const inc = (k: keyof typeof metrics, by = 1) => {
  if (typeof metrics[k] === 'number') {
    // @ts-ignore
    metrics[k] += by;
  }
};

export const setError = (msg: string | null) => {
  metrics.lastError = msg;
};

export const snapshot = () => ({ ...metrics });

export default metrics;
