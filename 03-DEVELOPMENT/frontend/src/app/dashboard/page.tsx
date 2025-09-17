'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLastUpdated } from '@/context/LastUpdatedContext';
import { useMode } from '@/context/ModeContext';
import { useBots } from '@/context/BotsContext';
import {
  Container,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  Metric,
  Modal,
  TradingCard,
  SectionSpacer
} from '@/components';
import type { TradingMode, TradingStatus, Strategy, TradingSetup } from '@/components';

// Period options for metrics
const PERIOD_OPTIONS = [
  { name: '1 Day', value: '1d', label: 'TODAY' },
  { name: '1 Week', value: '1w', label: '7D' },
  { name: '1 Month', value: '1m', label: '30D' },
  { name: '6 Months', value: '6m', label: '180D' },
  { name: '1 Year', value: '1y', label: '365D' }
];

// Available strategies
const AVAILABLE_STRATEGIES: Strategy[] = [
  {
    id: 'scalping',
    name: 'USDC Futures Scalping',
    description: 'High-frequency BTC/ETH USDC perpetuals trading strategy focusing on small price movements with tight stop losses and quick profit taking.'
  },
  {
    id: 'trend-following',
    name: 'Futures Trend Following',
    description: 'Multi-timeframe USDC futures strategy for BTC/ETH/SOL that identifies and follows strong market trends with dynamic position sizing.'
  },
  {
    id: 'volatility-arbitrage',
    name: 'Volatility Arbitrage',
    description: 'Cross-contract USDC futures strategy that exploits volatility discrepancies between different cryptocurrency derivatives.'
  }
];

// Trading card interface
interface TradingCardData {
  id: string;
  title: string;
  status: TradingStatus;
  mode: TradingMode;
  instrumentName?: string; // Deribit instrument for active position
  setup?: TradingSetup;
  strategies: Strategy[];
  activeStrategy?: Strategy;
  linkedStrategies: Strategy[];
  error?: string;
}

export default function DashboardPage() {
  const { mode } = useMode();
  const { globalStopped, stopAll, startAll, stopBot, startBot } = useBots();
  // Live balance state
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);
  const [balanceRefreshing, setBalanceRefreshing] = useState<boolean>(false);
  // Live metrics today (PnL proxy and trades count)
  const [tradesToday, setTradesToday] = useState<number>(0);
  const [pnlToday, setPnlToday] = useState<number | null>(null);
  const [pnlValue, setPnlValue] = useState<number | null>(null);
  const [winrateValue, setWinrateValue] = useState<number | null>(null);
  const [drawdownValue, setDrawdownValue] = useState<number | null>(null);
  const [winRatioValue, setWinRatioValue] = useState<number | null>(null);
  // Period selection states
  const [pnlPeriod, setPnlPeriod] = useState(PERIOD_OPTIONS[0]); // Default to 1 day
  const [winratePeriod, setWinratePeriod] = useState(PERIOD_OPTIONS[0]);
  const [drawdownPeriod, setDrawdownPeriod] = useState(PERIOD_OPTIONS[0]);
  const [winRatioPeriod, setWinRatioPeriod] = useState(PERIOD_OPTIONS[0]);

  useEffect(() => {
    let active = true;
    const firstLoadRef = { current: true } as { current: boolean };
    const fetchBalance = async () => {
      try {
        if (firstLoadRef.current) {
          setBalanceLoading(true);
        } else {
          setBalanceRefreshing(true);
        }
        setBalanceError(null);
        const res = await fetch('/api/deribit/balance?currency=USDC', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        if (active) {
          setBalance(data.equity);
        }
      } catch (e) {
        const msg = (e as { message?: string })?.message || 'Kon balans niet laden';
        if (active) setBalanceError(msg);
      } finally {
        if (active) {
          if (firstLoadRef.current) {
            setBalanceLoading(false);
            firstLoadRef.current = false;
          }
          setBalanceRefreshing(false);
        }
      }
    };

    if (mode === 'live') {
      fetchBalance();
      const id = setInterval(fetchBalance, 15_000); // refresh elke 15s
      return () => {
        active = false;
        clearInterval(id);
      };
    } else {
      // Demo: set fixed example and stop loading
      setBalance(1234);
      setBalanceError(null);
      setBalanceLoading(false);
      setTradesToday(7);
      setPnlToday(312);
      return () => { active = false; };
    }
  }, [mode]);

  // Fetch today metrics in live mode
  useEffect(() => {
    let active = true;
    const firstLoadRef = { current: true } as { current: boolean };
    const fetchToday = async () => {
      try {
        const res = await fetch('/api/metrics/today?currency=USDC', { cache: 'no-store' });
        const data = await res.json();
        if (active && res.ok && data && data.ok) {
          setTradesToday(typeof data.tradesCount === 'number' ? data.tradesCount : 0);
          setPnlToday(typeof data.pnlToday === 'number' ? data.pnlToday : null);
        }
      } catch (_e) {
        // Geen reset tijdens refresh; behoud vorige waarden om flicker te voorkomen
      }
    };

    if (mode === 'live') {
      fetchToday();
      const id = setInterval(fetchToday, 20_000);
      return () => {
        active = false;
        clearInterval(id);
      };
    }

    return () => { active = false; };
  }, [mode]);

  // Per-metric period fetch (LIVE) - behoud vorige waarden tijdens refresh
  useEffect(() => {
    let active = true;
    const fetchFor = async (p: string) => {
      const res = await fetch(`/api/metrics/period?currency=USDC&period=${encodeURIComponent(p)}`, { cache: 'no-store' });
      const data = await res.json();
      return res.ok && data && data.ok ? data : null;
    };

    if (mode === 'live') {
      // PNL
      fetchFor(pnlPeriod.value).then((d) => {
        if (active && d && typeof d.pnl !== 'undefined') setPnlValue(d.pnl);
      }).catch(() => {});
      // Winrate/Drawdown/WinRatio – placeholders until implemented server-side
      fetchFor(winratePeriod.value).then((d) => {
        if (active && d && typeof d.winrate !== 'undefined') setWinrateValue(d.winrate);
      }).catch(() => {});
      fetchFor(drawdownPeriod.value).then((d) => {
        if (active && d && typeof d.drawdown !== 'undefined') setDrawdownValue(d.drawdown);
      }).catch(() => {});
      fetchFor(winRatioPeriod.value).then((d) => {
        if (active && d && typeof d.winRatio !== 'undefined') setWinRatioValue(d.winRatio);
      }).catch(() => {});
      return () => { active = false; };
    } else {
      setPnlValue(312);
      setWinrateValue(63);
      setDrawdownValue(4);
      setWinRatioValue(2.3);
      return () => { active = false; };
    }
  }, [mode, pnlPeriod, winratePeriod, drawdownPeriod, winRatioPeriod]);
  

  // Modal states for period selection
  const [showPnlModal, setShowPnlModal] = useState(false);
  const [showWinrateModal, setShowWinrateModal] = useState(false);
  const [showMaxDrawdownModal, setShowMaxDrawdownModal] = useState(false);
  const [showWinRatioModal, setShowWinRatioModal] = useState(false);
  // Last updated via context (shown in global footer)
  const { touch: touchLastUpdated } = useLastUpdated();

  // Trading cards state
  const demoCards: TradingCardData[] = useMemo(() => ([
    {
      id: 'card-1',
      title: 'BOT 1',
      status: 'active',
      mode: 'auto',
      instrumentName: 'BTC-PERPETUAL',
      strategies: AVAILABLE_STRATEGIES,
      linkedStrategies: [AVAILABLE_STRATEGIES[0]],
      activeStrategy: AVAILABLE_STRATEGIES[0],
      setup: {
        entry: 65234,
        stopLoss: 64500,
        takeProfit: 66800,
        leverage: 5,
        riskAmount: 100,
        riskPercentage: 1.5,
        positionSize: 0.02,
        unrealizedPnl: 42.5,
        trailing: true,
        strategy: AVAILABLE_STRATEGIES[0],
        timestamp: new Date(),
        isRelevant: true
      }
    },
    {
      id: 'card-2',
      title: 'BOT 2',
      status: 'setup',
      mode: 'manual',
      instrumentName: 'ETH-PERPETUAL',
      strategies: AVAILABLE_STRATEGIES,
      linkedStrategies: [AVAILABLE_STRATEGIES[1]],
      activeStrategy: AVAILABLE_STRATEGIES[1],
      setup: {
        entry: 2430,
        stopLoss: 2390,
        takeProfit: 2550,
        leverage: 3,
        riskAmount: 50,
        riskPercentage: 1.0,
        positionSize: 10,
        strategy: AVAILABLE_STRATEGIES[1],
        timestamp: new Date(),
        isRelevant: true
      }
    },
    {
      id: 'card-3',
      title: 'BOT 3',
      status: 'analyzing',
      mode: 'auto',
      instrumentName: 'SOL-PERPETUAL',
      strategies: AVAILABLE_STRATEGIES,
      linkedStrategies: [AVAILABLE_STRATEGIES[2]]
    }
  ]), []);

  const [tradingCards, setTradingCards] = useState<TradingCardData[]>(demoCards);

  // When switching modes, initialize demo cards or reset to analyzing
  useEffect(() => {
    if (mode === 'demo') {
      setTradingCards(demoCards);
    } else {
      // Initialize with analyzing state and then enrich with backend-provided instrument mapping
      const initial: TradingCardData[] = [
        { id: 'card-1', title: 'BOT 1', status: 'analyzing', mode: 'auto', instrumentName: 'BTC-PERPETUAL', strategies: AVAILABLE_STRATEGIES, linkedStrategies: [] },
        { id: 'card-2', title: 'BOT 2', status: 'analyzing', mode: 'manual', instrumentName: 'ETH-PERPETUAL', strategies: AVAILABLE_STRATEGIES, linkedStrategies: [] },
        { id: 'card-3', title: 'BOT 3', status: 'analyzing', mode: 'auto', instrumentName: 'SOL-PERPETUAL', strategies: AVAILABLE_STRATEGIES, linkedStrategies: [] }
      ];
      setTradingCards(initial);

      // Fetch live mapping from API (env-configurable) and merge
      (async () => {
        try {
          const res = await fetch('/api/strategy/bots', { cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data && data.ok && Array.isArray(data.bots)) {
            type ApiBot = { id?: string; instrumentName?: string };
            setTradingCards(prev => prev.map(card => {
              const found = (data.bots as ApiBot[]).find((b) => b.id === card.id);
              return found && found.instrumentName
                ? { ...card, instrumentName: String(found.instrumentName) }
                : card;
            }));
          }
        } catch (e) {
          // Silent fail; UI houdt default instrumenten aan
          console.warn('Kon bot mapping niet laden', e);
        }
      })();
    }
  }, [mode, demoCards]);

  // Strategy info modal
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  const handlePnlPeriodSelect = (period: typeof PERIOD_OPTIONS[0]) => {
    setPnlPeriod(period);
    setShowPnlModal(false);
  };

  const handleWinratePeriodSelect = (period: typeof PERIOD_OPTIONS[0]) => {
    setWinratePeriod(period);
    setShowWinrateModal(false);
  };

  const handleMaxDrawdownPeriodSelect = (period: typeof PERIOD_OPTIONS[0]) => {
    setDrawdownPeriod(period);
    setShowMaxDrawdownModal(false);
  };

  const handleWinRatioPeriodSelect = (period: typeof PERIOD_OPTIONS[0]) => {
    setWinRatioPeriod(period);
    setShowWinRatioModal(false);
  };

  // Helper functions for dynamic titles
  const getCardTitle = (baseTitle: string, period: typeof PERIOD_OPTIONS[0]) => {
    if (period.value === '1d') {
      return `${baseTitle} TODAY`;
    }
    return `${baseTitle} ${period.name.toUpperCase()}`;
  };

  // Trading card handlers
  const handleModeChange = (cardId: string, mode: TradingMode) => {
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { ...card, mode } : card
    ));
    touchLastUpdated();
  };

  const handleStrategyChange = (cardId: string, strategy: Strategy) => {
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { ...card, activeStrategy: strategy } : card
    ));
    touchLastUpdated();
  };

  const handleLinkStrategies = (cardId: string, strategies: Strategy[]) => {
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { ...card, linkedStrategies: strategies } : card
    ));
    touchLastUpdated();
  };

  const handlePlaceTrade = (cardId: string, setup: TradingSetup) => {
    // Simulate placing the trade
    console.log(`Placing trade for ${cardId}:`, setup);
    
    // Update card to active status
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { 
        ...card, 
        status: 'active' as TradingStatus,
        setup: { ...setup, unrealizedPnl: 0 }
      } : card
    ));
    touchLastUpdated();
  };

  const handleSkipTrade = (cardId: string, setup: TradingSetup) => {
    console.log(`Skipping trade for ${cardId}:`, setup);
    
    // Reset card to analyzing status
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { 
        ...card, 
        status: 'analyzing' as TradingStatus,
        setup: undefined
      } : card
    ));
    touchLastUpdated();
  };

  const handleStop = async (cardId: string) => {
    console.log(`Stopping card ${cardId}`);
    // Close position if active with a known instrument mapping (demo data not mapped to real instrument)
    if (mode === 'live') {
      try {
        // NOTE: In a real app, each card would have the instrument_name. For now we no-op if missing.
        const card = tradingCards.find(c => c.id === cardId);
        const instrumentName = card?.instrumentName;
        if (card?.status === 'active' && instrumentName) {
          await fetch('/api/emergency/close-position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instrumentName })
          });
        }
      } catch (e) {
        console.error('Failed to close position for card', cardId, e);
      }
    }
    stopBot(cardId);
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { 
        ...card, 
        status: 'stopped' as TradingStatus,
        setup: undefined
      } : card
    ));
    touchLastUpdated();
  };

  const handleStart = (cardId: string) => {
    console.log(`Starting card ${cardId}`);
    startBot(cardId);
    setTradingCards(prev => prev.map(card => 
      card.id === cardId ? { 
        ...card, 
        status: 'analyzing' as TradingStatus
      } : card
    ));
    touchLastUpdated();
  };

  const handleStrategyInfo = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setShowStrategyModal(true);
  };

  const handleErrorDetails = (error: string) => {
    console.log('Error details:', error);
  };

  // Sort trading cards by priority (active > setup > analyzing > error/stopped)
  const sortedTradingCards = [...tradingCards].sort((a, b) => {
    const priority = {
      'active': 1,
      'setup': 2,
      'analyzing': 3,
      'error': 4,
      'stopped': 4
    };
    return priority[a.status] - priority[b.status];
  });

  return (
    <Container>
      <div className="min-h-screen py-8">
        {/* Metrics Container */}
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 items-stretch">
            {/* Balance Card - First position */}
            <Card variant="glass" className="backdrop-blur-md">
              <CardHeader className="mb-0 pb-0 h-6 flex items-center justify-center">
                {/* Houd BALANCE exact gecentreerd; indicator absoluut naast de titel */}
                <div className="relative inline-flex items-center">
                  <CardTitle className="text-xs leading-tight font-medium tracking-wide text-center text-white whitespace-nowrap overflow-hidden text-ellipsis">
                    BALANCE
                  </CardTitle>
                  <span
                    className={`absolute left-full ml-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${balanceRefreshing ? 'bg-white/50 animate-pulse' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                </div>
              </CardHeader>
              <CardContent className="text-center pt-1">
                <Metric
                  value={typeof balance === 'number' ? balance : '---'}
                  trend="neutral"
                  currency="USDC"
                  showLabel={false}
                  size="sm"
                />
              </CardContent>
            </Card>

            {/* PNL Card */}
            <Card variant="glass" className="transition-shadow cursor-pointer backdrop-blur-md" onClick={() => setShowPnlModal(true)}>
              <CardHeader className="mb-0 pb-0 h-6 flex items-center justify-center">
                <CardTitle className="text-xs leading-tight font-medium tracking-wide text-center text-white whitespace-nowrap overflow-hidden text-ellipsis">
                  {getCardTitle('PNL', pnlPeriod)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center pt-1">
                <Metric
                  value={mode === 'demo' ? 312 : (pnlValue === null ? '---' : pnlValue)}
                  trend="neutral"
                  currency="USDC"
                  showLabel={false}
                  size="sm"
                />
              </CardContent>
            </Card>

            {/* Winrate Card */}
            <Card variant="glass" className="transition-shadow cursor-pointer backdrop-blur-md" onClick={() => setShowWinrateModal(true)}>
              <CardHeader className="mb-0 pb-0 h-6 flex items-center justify-center">
                <CardTitle className="text-xs leading-tight font-medium tracking-wide text-center text-white whitespace-nowrap overflow-hidden text-ellipsis">
                  {getCardTitle('WINRATE', winratePeriod)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center pt-1">
                <Metric value={mode === 'demo' ? '63%' : (winrateValue === null ? '---' : `${winrateValue}%`)} trend="neutral" showLabel={false} size="sm" />
              </CardContent>
            </Card>

            {/* Drawdown Card */}
            <Card variant="glass" className="transition-shadow cursor-pointer backdrop-blur-md" onClick={() => setShowMaxDrawdownModal(true)}>
              <CardHeader className="mb-0 pb-0 h-6 flex items-center justify-center">
                <CardTitle className="text-xs leading-tight font-medium tracking-wide text-center text-white whitespace-nowrap overflow-hidden text-ellipsis">
                  {getCardTitle('DRAWDOWN', drawdownPeriod)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center pt-1">
                <Metric value={mode === 'demo' ? '4%' : (drawdownValue === null ? '---' : `${drawdownValue}%`)} trend="neutral" showLabel={false} size="sm" />
              </CardContent>
            </Card>

            {/* Win Ratio Card */}
            <Card variant="glass" className="transition-shadow cursor-pointer backdrop-blur-md" onClick={() => setShowWinRatioModal(true)}>
              <CardHeader className="mb-0 pb-0 h-6 flex items-center justify-center">
                <CardTitle className="text-xs leading-tight font-medium tracking-wide text-center text-white whitespace-nowrap overflow-hidden text-ellipsis">
                  {getCardTitle('WIN RATIO', winRatioPeriod)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center pt-1">
                <Metric value={mode === 'demo' ? '2.3:1' : (winRatioValue === null ? '---' : `${winRatioValue}:1`)} trend="neutral" showLabel={false} size="sm" />
              </CardContent>
            </Card>

            {/* Trades Card */}
            <Card variant="glass" className="backdrop-blur-md">
              <CardHeader className="mb-0 pb-0 h-6 flex items-center justify-center">
                <CardTitle className="text-xs leading-tight font-medium tracking-wide text-center text-white whitespace-nowrap overflow-hidden text-ellipsis">TRADES TODAY</CardTitle>
              </CardHeader>
              <CardContent className="text-center pt-1">
                <Metric value={mode === 'demo' ? 7 : tradesToday} trend="neutral" showLabel={false} size="sm" />
              </CardContent>
            </Card>
          </div>
        </div>

    {/* Section spacer: iets compacter om meer ruimte voor card-inhoud te maken */}
  <SectionSpacer gap="sm" className="-mt-2" />

        {/* Trading Cards Container */}
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7 items-stretch">
            {sortedTradingCards.map((card) => (
            <TradingCard
              key={card.id}
              id={card.id}
              title={card.title}
              status={card.status}
              mode={card.mode}
              instrumentName={card.instrumentName}
              // Provide the instrument to the card via setup or props if needed
              setup={card.setup}
              strategies={card.strategies}
              activeStrategy={card.activeStrategy}
              linkedStrategies={card.linkedStrategies}
              error={card.error}
              onModeChange={(mode) => handleModeChange(card.id, mode)}
              onStrategyChange={(strategy) => handleStrategyChange(card.id, strategy)}
              onLinkStrategies={(strategies) => handleLinkStrategies(card.id, strategies)}
              onPlaceTrade={(setup) => handlePlaceTrade(card.id, setup)}
              onSkipTrade={(setup) => handleSkipTrade(card.id, setup)}
              onStop={() => handleStop(card.id)}
              onStart={() => handleStart(card.id)}
              onStrategyInfo={handleStrategyInfo}
              onErrorDetails={handleErrorDetails}
            />
          ))}
          </div>
        </div>
        {/* Page-level last updated is now displayed in the global blue footer */}
      </div>

      {/* Strategy Info Modal */}
      <Modal
        isOpen={showStrategyModal}
        onClose={() => setShowStrategyModal(false)}
        title={selectedStrategy?.name || 'Strategy Information'}
        size="md"
      >
        <div className="text-stack">
          <p className="text-white/80">
            {selectedStrategy?.description || 'No strategy information available.'}
          </p>
        </div>
      </Modal>

      {/* Period Selection Modals */}
      
      {/* PNL Period Modal */}
      <Modal 
        isOpen={showPnlModal}
        onClose={() => setShowPnlModal(false)}
        title="Select PNL Period"
        size="sm"
      >
        <div className="grid grid-cols-1 gap-2">
          {PERIOD_OPTIONS.map((period) => (
            <button
              key={period.value}
              onClick={() => handlePnlPeriodSelect(period)}
              className={`group relative px-4 py-3 text-center rounded-lg border transition-all duration-300 backdrop-blur-sm ${
                pnlPeriod.value === period.value
                  ? 'border-white/30 text-white shadow-lg scale-[1.02]'
                  : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white/90 hover:scale-[1.01]'
              }`}
              style={{
                background: pnlPeriod.value === period.value 
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(255, 255, 255, 0.04)',
                backdropFilter: 'blur(8px)',
                boxShadow: pnlPeriod.value === period.value
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 16px rgba(255, 255, 255, 0.1)'
                  : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            >
              {pnlPeriod.value === period.value && null}
              <div className="relative">
                <div className="font-medium text-sm">{period.name}</div>
                <div className={`text-xs ${
                  pnlPeriod.value === period.value ? 'text-white/80' : 'text-white/50'
                }`}>{period.label}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Winrate Period Modal */}
      <Modal 
        isOpen={showWinrateModal}
        onClose={() => setShowWinrateModal(false)}
        title="Select Winrate Period"
        size="sm"
      >
        <div className="grid grid-cols-1 gap-2">
          {PERIOD_OPTIONS.map((period) => (
            <button
              key={period.value}
              onClick={() => handleWinratePeriodSelect(period)}
              className={`group relative px-4 py-3 text-center rounded-lg border transition-all duration-300 backdrop-blur-sm ${
                winratePeriod.value === period.value
                  ? 'border-white/30 text-white shadow-lg scale-[1.02]'
                  : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white/90 hover:scale-[1.01]'
              }`}
              style={{
                background: winratePeriod.value === period.value 
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(255, 255, 255, 0.04)',
                backdropFilter: 'blur(8px)',
                boxShadow: winratePeriod.value === period.value
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 16px rgba(255, 255, 255, 0.1)'
                  : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            >
              {winratePeriod.value === period.value && null}
              <div className="relative">
                <div className="font-medium text-sm">{period.name}</div>
                <div className={`text-xs ${
                  winratePeriod.value === period.value ? 'text-white/80' : 'text-white/50'
                }`}>{period.label}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Drawdown Period Modal */}
      <Modal 
        isOpen={showMaxDrawdownModal}
        onClose={() => setShowMaxDrawdownModal(false)}
        title="Select Drawdown Period"
        size="sm"
      >
        <div className="grid grid-cols-1 gap-2">
          {PERIOD_OPTIONS.map((period) => (
            <button
              key={period.value}
              onClick={() => handleMaxDrawdownPeriodSelect(period)}
              className={`group relative px-4 py-3 text-center rounded-lg border transition-all duration-300 backdrop-blur-sm ${
                drawdownPeriod.value === period.value
                  ? 'border-white/30 text-white shadow-lg scale-[1.02]'
                  : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white/90 hover:scale-[1.01]'
              }`}
              style={{
                background: drawdownPeriod.value === period.value 
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(255, 255, 255, 0.04)',
                backdropFilter: 'blur(8px)',
                boxShadow: drawdownPeriod.value === period.value
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 16px rgba(255, 255, 255, 0.1)'
                  : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            >
              {drawdownPeriod.value === period.value && null}
              <div className="relative">
                <div className="font-medium text-sm">{period.name}</div>
                <div className={`text-xs ${
                  drawdownPeriod.value === period.value ? 'text-white/80' : 'text-white/50'
                }`}>{period.label}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Win Ratio Period Modal */}
      <Modal 
        isOpen={showWinRatioModal}
        onClose={() => setShowWinRatioModal(false)}
        title="Select Win Ratio Period"
        size="sm"
      >
        <div className="grid grid-cols-1 gap-2">
          {PERIOD_OPTIONS.map((period) => (
            <button
              key={period.value}
              onClick={() => handleWinRatioPeriodSelect(period)}
              className={`group relative px-4 py-3 text-center rounded-lg border transition-all duration-300 backdrop-blur-sm ${
                winRatioPeriod.value === period.value
                  ? 'border-white/30 text-white shadow-lg scale-[1.02]'
                  : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white/90 hover:scale-[1.01]'
              }`}
              style={{
                background: winRatioPeriod.value === period.value 
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(255, 255, 255, 0.04)',
                backdropFilter: 'blur(8px)',
                boxShadow: winRatioPeriod.value === period.value
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 16px rgba(255, 255, 255, 0.1)'
                  : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            >
              {winRatioPeriod.value === period.value && null}
              <div className="relative">
                <div className="font-medium text-sm">{period.name}</div>
                <div className={`text-xs ${
                  winRatioPeriod.value === period.value ? 'text-white/80' : 'text-white/50'
                }`}>{period.label}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </Container>
  );
}
