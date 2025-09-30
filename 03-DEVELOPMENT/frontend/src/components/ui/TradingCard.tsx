'use client';

import React, { useMemo, useState } from 'react';
import { Button, Modal, ConfirmModal } from '@/components';
import { useBots } from '@/context/BotsContext';

// Trading modes
export type TradingMode = 'auto' | 'manual';

// Trading card status
export type TradingStatus = 'active' | 'setup' | 'analyzing' | 'error' | 'stopped';

// Strategy type
export interface Strategy {
  id: string;
  name: string;
  description: string;
}

// Trading setup data
export interface TradingSetup {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  riskAmount: number;
  riskPercentage: number;
  positionSize: number;
  unrealizedPnl?: number;
  trailing?: boolean;
  strategy: Strategy;
  timestamp: Date;
  isRelevant: boolean;
}

// Trading card props
export interface TradingCardProps {
  id: string;
  title: string;
  status: TradingStatus;
  mode: TradingMode;
  instrumentName?: string;
  setup?: TradingSetup;
  strategies: Strategy[];
  activeStrategy?: Strategy;
  linkedStrategies: Strategy[];
  error?: string;
  onModeChange: (mode: TradingMode) => void;
  onStrategyChange: (strategy: Strategy) => void;
  onLinkStrategies: (strategies: Strategy[]) => void;
  onPlaceTrade: (setup: TradingSetup) => Promise<void> | void;
  onSkipTrade: (setup: TradingSetup) => void;
  onStop: () => void;
  onStart: () => void;
  onStrategyInfo: (strategy: Strategy) => void;
  onErrorDetails: (error: string) => void;
}

export const TradingCard: React.FC<TradingCardProps> = ({
  id,
  title,
  status,
  mode,
  instrumentName,
  setup,
  strategies,
  activeStrategy,
  linkedStrategies,
  error,
  onModeChange,
  onStrategyChange,
  onLinkStrategies,
  onPlaceTrade,
  onSkipTrade,
  onStop,
  onStart,
  onStrategyInfo,
  onErrorDetails
}) => {
  const { globalStopped, isBotStopped, stopBot, startBot } = useBots();
  const [showStopModal, setShowStopModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showStrategySelectorModal, setShowStrategySelectorModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [localSelectedStrategyIds, setLocalSelectedStrategyIds] = useState<Set<string>>(new Set(linkedStrategies.map(s => s.id)));
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);

  // No last update indicator in card per request

  const getStatusText = () => {
    switch (status) {
      case 'active':
        return 'ACTIVE TRADE';
      case 'setup':
        return 'SETUP READY';
      case 'analyzing':
        return 'ANALYZING';
      case 'error':
        return 'ERROR';
      case 'stopped':
        return 'STOPPED';
      default:
        return 'UNKNOWN';
    }
  };

  // Subtiele dot-kleur per status
  const getStatusDotClass = () => {
    switch (status) {
      case 'active':
        return 'bg-emerald-400'; // groen
      case 'setup':
        return 'bg-yellow-300'; // geel (actief signaal)
      case 'error':
        return 'bg-orange-400'; // oranje
      case 'stopped':
        return 'bg-red-400'; // rood
      case 'analyzing':
      default:
        return 'bg-white/60'; // subtiel grijs
    }
  };

  const effectiveStopped = useMemo(() => globalStopped || isBotStopped(id) || status === 'stopped', [globalStopped, id, isBotStopped, status]);

  const handleStop = () => {
    setShowStopModal(false);
    stopBot(id);
    setLocalErrorMessage(null);
    onStop();
  };

  const handleSkip = () => {
    if (setup) {
      setShowSkipModal(false);
      setLocalErrorMessage(null);
      onSkipTrade(setup);
    }
  };

  const handlePlaceTrade = async () => {
    if (!setup) return;
    setLocalErrorMessage(null);
    setIsPlacingTrade(true);
    try {
      await onPlaceTrade(setup);
    } catch (err) {
      const message = (err as { message?: string })?.message || 'Failed to place trade';
      setLocalErrorMessage(message);
      setShowErrorModal(true);
      onErrorDetails(message);
    } finally {
      setIsPlacingTrade(false);
    }
  };

  // Strategy-info wordt via een centrale modal getoond

  const errorMessage = localErrorMessage || error;

  const handleErrorClick = () => {
    if (errorMessage) {
      setShowErrorModal(true);
      onErrorDetails(errorMessage);
    }
  };

  const copyError = () => {
    if (errorMessage) {
      navigator.clipboard.writeText(errorMessage);
    }
  };

  // Strategy button: contextueel gedrag
  const handleStrategyButtonClick = () => {
    const hasActiveTrade = status === 'active';
    const hasManualSignal = mode === 'manual' && !!setup && status === 'setup';
    if (hasActiveTrade || hasManualSignal) {
      const infoStrategy = setup?.strategy || activeStrategy || linkedStrategies[0];
      if (infoStrategy) {
        onStrategyInfo(infoStrategy);
      }
      setShowStrategyModal(true); // toon overzicht met highlight
    } else {
      setShowStrategySelectorModal(true); // geen trade/signaal => direct beheren/selecteren
    }
  };

  return (
    <>
      {/* Trading Card */}
      <div className="relative group h-full">
        {/* Premium creditcard styling */}
        <div 
          className="relative h-full p-7 md:p-8 rounded-xl border transition-all duration-300 flex flex-col text-sm"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            minHeight: '500px'
          }}
        >
          {/* Content stack: header + pnl + core fields with gelijke gaps; laat dit geheel uitvullen */}
          <div className="flex flex-col flex-1 text-stack" style={{ ['--text-gap' as unknown as string]: '0.75rem' }}>
            {/* Header: title + status on left, gear + mode on right */}
            <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm md:text-base font-normal text-white tracking-wide truncate">
                  {title}
                </h3>
                {/* Subtiele status-indicator: enkel een gekleurde dot met tooltip */}
                <span
                  className={`inline-block w-2 h-2 rounded-full ${getStatusDotClass()}`}
                  title={getStatusText()}
                  aria-label={`Status: ${getStatusText()}`}
                />
              </div>
              <div className="flex items-center gap-2">
                {/* Strategy knop: toont actieve strategie of aantal gelinkte strategieën; opent contextueel overzicht of selector */}
                <button
                  onClick={handleStrategyButtonClick}
                  className="hidden sm:inline-flex items-center max-w-[12rem] truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] !font-normal text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  title={linkedStrategies?.length ? `Strategies (${linkedStrategies.length})` : 'No strategies linked'}
                >
                  {`Strategies (${linkedStrategies?.length || 0})`}
                </button>
                {/* Compact Mode Toggle (single button) */}
                <button
                  onClick={async () => {
                    const next = mode === 'auto' ? 'manual' : 'auto';
                    try {
                      // Ping backend alleen in live om modus te bewaren
                      await fetch('/api/strategy/mode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, mode: next })
                      });
                    } catch {}
                    onModeChange(next);
                  }}
                  title={`Switch to ${mode === 'auto' ? 'Manual' : 'Auto'}`}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] !font-normal text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {mode === 'auto' ? 'Auto' : 'Manual'}
                </button>
              </div>
            </div>
            {/* Geen subtitel meer; strategie wordt via de header-knop getoond */}
            </div>

          {/* Trading Data Section - compacter: toon kernvelden + details-knop */}
          <div className="flex-1 flex flex-col mb-7 pt-1">
            {/* PnL alleen als tekst; groen bij positief, rood bij negatief; geen chip/border */}
            <div className="w-full text-center font-sans tabular-nums text-sm md:text-base">
              {setup && status === 'active' && typeof setup.unrealizedPnl === 'number' ? (
                (() => {
                  const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                  const abs = Math.abs(setup.unrealizedPnl);
                  const formatted = nf.format(abs);
                  const sign = setup.unrealizedPnl >= 0 ? '+' : '-';
                  const color = setup.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
                  return <span className={color}>{`${sign}$${formatted} Unrealized P&L`}</span>;
                })()
              ) : (
                <span className="text-white/70">No open position</span>
              )}
            </div>

            {/* Kernvelden: gebruik dezelfde verticale ritmiek als overal via text-stack */}
            <div className="text-stack" style={{ ['--text-gap' as unknown as string]: '0.75rem' }}>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Entry</span>
                <span className="text-base md:text-[15px] font-normal text-white/90 font-sans tabular-nums">{setup ? `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(setup.entry)}` : '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Stop loss</span>
                <span className={`text-base md:text-[15px] font-normal font-sans tabular-nums ${setup ? 'text-rose-400/90' : 'text-white/40'}`}>{setup ? `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(setup.stopLoss)}` : '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Take profit</span>
                <span className={`text-base md:text-[15px] !font-normal font-sans tabular-nums ${setup ? 'text-emerald-400' : 'text-white/40'}`}>{setup ? `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(setup.takeProfit)}` : '—'}</span>
              </div>
            </div>

            {/* Details knop voor overige velden */}
            {/* Zelfde afstand als tussen de regels erboven (0.75rem) */}
            <div className="flex justify-end" style={{ marginTop: '0.75rem' }}>
              <button
                onClick={() => setShowDetailsModal(true)}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] !font-normal text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                Details
              </button>
            </div>

            {/* Chips: Trailing / Relevance */}
            <div className="mt-4 md:mt-5 flex flex-wrap items-center gap-2">
              {setup && mode === 'manual' && status === 'setup' && !setup.isRelevant && (
                <span className="px-2.5 py-1 rounded-full text-xs border border-yellow-300/20 bg-yellow-300/10 text-yellow-300/90">Setup may no longer be relevant</span>
              )}
              {errorMessage && (
                <button
                  type="button"
                  onClick={handleErrorClick}
                  className="px-2.5 py-1 rounded-full text-xs border border-red-400/40 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
                >
                  View error
                </button>
              )}
            </div>
            {/* Extra vaste ruimte tussen kernvelden en actieknoppen */}
            <div className="h-8 md:h-10" aria-hidden="true" />
          </div>
          </div>

          {/* Action Buttons Section - Bottom Fixed */}
          <div className="space-y-5 md:space-y-6 mt-auto pt-0">
            {/* Manual Mode Trade Buttons */}
            {mode === 'manual' && status === 'setup' && setup && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={handlePlaceTrade}
                    variant="ghost"
                    size="sm"
                    className="w-full border border-white/15 bg-white/5 hover:bg-white/8 text-white/95 hover:text-white !font-normal"
                    disabled={!setup.isRelevant || isPlacingTrade}
                    aria-busy={isPlacingTrade}
                  >
                    {isPlacingTrade ? 'Placing…' : 'Place trade'}
                  </Button>
                  <Button
                    onClick={() => setShowSkipModal(true)}
                    variant="ghost"
                    size="sm"
                    className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white !font-normal"
                    disabled={isPlacingTrade}
                  >
                    Skip
                  </Button>
                </div>
                {/* Kleinere spacer zodat STOP dichterbij komt */}
                <div className="h-2 md:h-3" aria-hidden="true" />
              </>
            )}

            {/* Stop/Start Button */}
            <div className="w-full mt-1">
              {!effectiveStopped ? (
                <Button
                  onClick={() => setShowStopModal(true)}
                  variant="ghost"
                  size="sm"
                  className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/10 !font-normal"
                >
                  STOP
                </Button>
              ) : (
                <Button
                  onClick={() => { startBot(id); onStart(); }}
                  variant="ghost"
                  size="sm"
                  className="w-full border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10 !font-normal"
                >
                  Start
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stop Confirmation Modal */}
      <ConfirmModal
        isOpen={showStopModal}
        onClose={() => setShowStopModal(false)}
        onConfirm={handleStop}
        title="Stop Trading Card"
        message={
          status === 'active'
            ? 'This will close the active trade and stop market analysis. Are you sure?'
            : 'This will stop market analysis for this card. Are you sure?'
        }
        confirmText="STOP"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Skip Trade Modal */}
      <ConfirmModal
        isOpen={showSkipModal}
        onClose={() => setShowSkipModal(false)}
        onConfirm={handleSkip}
        title="Skip Trade Setup"
        message="Are you sure you want to skip this trading setup? The card will continue analyzing the market."
        confirmText="Skip"
        cancelText="Cancel"
        variant="primary"
      />

      {/* Strategies Overzicht Modal */}
      <Modal
        isOpen={showStrategyModal}
        onClose={() => setShowStrategyModal(false)}
        title="Strategies"
        size="md"
      >
        {(() => {
          const activeName = setup?.strategy?.name || activeStrategy?.name || null;
          const list = Array.isArray(linkedStrategies) ? linkedStrategies : [];
          const hasItems = list.length > 0;
          const sorted = hasItems
            ? [...list].sort((a, b) => (a.name === activeName ? -1 : b.name === activeName ? 1 : 0))
            : [];
          return (
            <div className="text-stack">
              {!hasItems && (
                <div className="text-white/60 text-sm">No strategies linked to this bot.</div>
              )}
              {hasItems && (
                <ul className="text-stack">
                  {sorted.map((s) => {
                    const isActive = s.name === activeName;
                    return (
                      <li
                        key={s.id}
                        className={`p-3 rounded-lg border transition-colors ${isActive ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'}`}
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="text-stack">
                            <div className="text-sm font-normal text-white/90 truncate max-w-[18rem]" title={s.name}>{s.name}</div>
                            <div className="text-xs text-white/60 line-clamp-2">{s.description}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {isActive ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] border border-brand-mint/30 text-brand-mint bg-brand-mint/10 !font-normal">Active</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onStrategyChange(s)}
                                className="px-2 py-0.5 rounded-full text-[10px] border border-white/20 text-white/80 hover:border-white/40 hover:text-white"
                              >
                                Set active
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="pt-2 grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white !font-normal"
                  onClick={() => setShowStrategyModal(false)}
                >
                  Close
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white !font-normal"
                  onClick={() => { setShowStrategyModal(false); setShowStrategySelectorModal(true); }}
                >
                  Manage
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Error Details Modal */}
      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Error Details"
        size="md"
      >
        <div className="text-stack">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <pre className="text-sm font-normal text-red-400 whitespace-pre-wrap">{errorMessage}</pre>
          </div>
          <Button
            onClick={copyError}
            variant="ghost"
            size="sm"
            className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white !font-normal"
            disabled={!errorMessage}
          >
            Copy error
          </Button>
        </div>
      </Modal>

      {/* Strategy Selector Modal */}
      <Modal
        isOpen={showStrategySelectorModal}
        onClose={() => setShowStrategySelectorModal(false)}
        title="Link Strategies"
        size="md"
      >
        <div className="text-stack">
          {strategies.map((strategy) => {
            const checked = localSelectedStrategyIds.has(strategy.id);
            return (
              <label
                key={strategy.id}
                className={`relative w-full p-4 rounded-lg border transition-all duration-300 backdrop-blur-sm flex items-start gap-3 cursor-pointer ${
                  checked
                    ? 'border-white/30 text-white shadow-lg'
                    : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white/90'
                }`}
                style={{
                  background: checked ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setLocalSelectedStrategyIds(prev => {
                      const next = new Set(prev);
                      if (next.has(strategy.id)) next.delete(strategy.id); else next.add(strategy.id);
                      return next;
                    });
                  }}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-white/90 focus:ring-white/30"
                />
                <div className="relative text-stack">
                  <div className="font-normal text-sm">{strategy.name}</div>
                  <div className={`text-xs leading-relaxed ${checked ? 'text-white/80' : 'text-white/50'}`}>{strategy.description}</div>
                </div>
              </label>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white !font-normal"
            onClick={() => setShowStrategySelectorModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10 !font-normal"
            onClick={() => {
              const next = strategies.filter(s => localSelectedStrategyIds.has(s.id));
              onLinkStrategies(next);
              setShowStrategySelectorModal(false);
            }}
          >
            Apply
          </Button>
        </div>
      </Modal>

      {/* Details Modal: Leverage, Risk, Position Size, Instrument */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Details"
        size="sm"
      >
        <div className="text-stack">
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/70">Leverage</span>
            <span className="text-base font-normal text-white/90 font-sans tabular-nums">{setup ? `${setup.leverage}x` : '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/70">Risk (USDC / %)</span>
            <span className="text-base font-normal text-white/85 font-sans tabular-nums">{setup ? `${setup.riskAmount ?? '—'} / ${typeof setup.riskPercentage === 'number' ? `${setup.riskPercentage}%` : '—'}` : '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/70">Position size</span>
            <span className="text-base font-normal text-white/90 font-sans tabular-nums">{setup ? `${setup.positionSize}` : '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/70">Instrument</span>
            <span className="text-sm font-normal text-white/80 font-mono truncate max-w-[60%] text-right">{instrumentName || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/70">Trailing</span>
            <span className="text-base font-normal text-white/85">
              {setup && typeof setup.trailing === 'boolean' ? (setup.trailing ? 'On' : 'Off') : '—'}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white !font-normal"
            onClick={() => setShowDetailsModal(false)}
          >
            Close
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default TradingCard;