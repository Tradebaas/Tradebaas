import { useState, useEffect } from 'react';
import { useTradingStore, type RiskSettings } from '@/state/store';
import { useBackendStrategyStatus } from '@/hooks/use-backend-strategy-status';
import { useOpenPositionFromDB } from '@/hooks/use-open-position-from-db';
import { backendStrategyClient } from '@/lib/backend-strategy-client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Play, Pause, Plus, Minus, Eye, Warning } from '@phosphor-icons/react';
import { useKV } from '@/hooks/use-kv-polyfill';
import { toast } from 'sonner';
import { AnalysisDetailsDialog } from '@/components/dialogs/AnalysisDetailsDialog';
import { StrategyErrorLogsDialog } from '@/components/dialogs/StrategyErrorLogsDialog';
import { CurrentPositionCard } from '@/components/trading/CurrentPositionCard';
import { Badge } from '@/components/ui/badge';

interface StrategyTradingCardProps {
  // No props needed - disclaimer handled in registration
}

export function StrategyTradingCard(props?: StrategyTradingCardProps) {
  const { 
    connectionState, 
    riskSettings, 
    setRiskSettings, 
    usdcBalance, 
    strategyStatus,
    selectedStrategy,
    setSelectedStrategy,
    startStrategy,
    stopStrategy,
    strategyErrorLogs,
    clearStrategyErrorLogs,
    strategy,
    activePosition,
  } = useTradingStore();
  
  const [savedRiskSettings, setSavedRiskSettings] = useKV<RiskSettings>('risk-settings', {
    mode: 'percent',
    value: 1,
  });
  
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [errorLogsDialogOpen, setErrorLogsDialogOpen] = useState(false);

  const isConnected = connectionState === 'Active';
  
  // DATABASE-FIRST: Poll SQLite for open position (Single Source of Truth!)
  const { openPosition: dbPosition, isLoading: dbLoading, error: dbError } = useOpenPositionFromDB();
  
  // Poll backend for strategy status
  const backendStatus = useBackendStrategyStatus(isConnected);
  
  // Determine if strategy is running on backend (ONLY count active strategies)
  const isStrategyRunningOnBackend = backendStatus.isRunning;
  
  // DATABASE-FIRST: Auto-set strategy from database if position is open
  useEffect(() => {
    if (dbPosition && dbPosition.strategyName) {
      // Convert to lowercase to match backend strategy IDs (backend uses lowercase)
      const strategyId = dbPosition.strategyName.toLowerCase();
      
      // Only update if different (prevent infinite loop)
      if (selectedStrategy !== strategyId) {
        console.log('[StrategyTradingCard] Auto-selecting strategy from database:', dbPosition.strategyName, '→', strategyId);
        setSelectedStrategy(strategyId);
      }
    }
  }, [dbPosition, selectedStrategy, setSelectedStrategy]);
  
  // CRITICAL: Actual strategy status based on DATABASE + backend state
  let actualStrategyStatus: typeof strategyStatus = strategyStatus;
  
  // HARD RULE 1: If DATABASE has open position → ALWAYS show 'in-position' (Single Source of Truth!)
  if (dbPosition) {
    actualStrategyStatus = 'in-position';
  }
  // HARD RULE 2 (Fallback): If store has activePosition → ALWAYS show 'in-position'
  else if (activePosition) {
    actualStrategyStatus = 'in-position';
  }
  // HARD RULE 3: If backend reports open position → ALWAYS show 'in-position'
  else if (backendStatus.hasOpenPosition) {
    actualStrategyStatus = 'in-position';
  } else if (isStrategyRunningOnBackend) {
    // Strategy running, map backend status to UI status
    switch (backendStatus.derivedStatus) {
      case 'position_open':
        actualStrategyStatus = 'in-position';
        break;
      case 'analyzing':
      case 'cooldown':
        actualStrategyStatus = 'analyzing';
        break;
      case 'error':
        actualStrategyStatus = 'stopped';
        break;
      case 'stopped':
      case 'idle':
      default:
        actualStrategyStatus = 'stopped';
        break;
    }
  } else {
    // No backend strategy running
    if (!backendStatus.hasOpenPosition && actualStrategyStatus === 'in-position') {
      // Position was closed externally, reset to stopped
      actualStrategyStatus = 'stopped';
    }
  }
  
  // Sync selected strategy with backend
  useEffect(() => {
    if (!isStrategyRunningOnBackend || backendStatus.strategies.length === 0) {
      return;
    }
    
    // Find ACTIVE strategy (not stopped)
    const activeStrategy = backendStatus.strategies.find(s => s.status === 'active');
    if (!activeStrategy || !activeStrategy.name) {
      return;
    }
    
    const backendId = activeStrategy.name.toLowerCase();
    
    // Only update if not already set or different
    if (!selectedStrategy || selectedStrategy !== backendId) {
      console.log('[StrategyTradingCard] Syncing selected strategy from backend:', backendId);
      setSelectedStrategy(backendId);
    }
  }, [isStrategyRunningOnBackend, backendStatus.strategies, selectedStrategy, setSelectedStrategy]);
  
  useEffect(() => {
    if (savedRiskSettings) {
      setRiskSettings(savedRiskSettings);
    }
  }, [savedRiskSettings, setRiskSettings]);

  const handleStrategyToggle = async () => {
    // NEW LOGIC based on status:
    // - analyzing/active → STOP (pause if position open)
    // - paused → QUEUE for after position close (DON'T start immediately!)
    // - stopped → START (only if no position)
    
    const isRunning = actualStrategyStatus === 'analyzing' || actualStrategyStatus === 'active';
    const isPaused = actualStrategyStatus === 'paused';
    
    if (isRunning) {
      // STOP/PAUSE logic
      if (isStrategyRunningOnBackend && backendStatus.strategies.length > 0) {
        try {
          const backendStrategy = backendStatus.strategies[0];
          await backendStrategyClient.stopStrategy({ strategyId: backendStrategy.id });
          toast.info('Backend strategy gestopt');
        } catch (error) {
          console.error('Failed to stop backend strategy:', error);
          toast.error('Kon backend strategy niet stoppen');
        }
      }
      
      stopStrategy(true);
      
      if (activePosition) {
        // Strategy will pause and auto-resume after position closes
        toast.info('Strategie gepauzeerd - Wordt automatisch hervat na sluiten van positie');
      } else {
        // No position, completely stopped
        toast.success('Strategie gestopt');
      }
      
    } else if (isPaused && activePosition) {
      // QUEUE logic: Position open - store already handles this
      // Just call startStrategy, it will queue automatically
      if (selectedStrategy) {
        try {
          await startStrategy(selectedStrategy);
          toast.success('✓ Strategie in wachtrij - Start automatisch zodra positie sluit');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to queue strategy';
          toast.error(errorMessage);
        }
      }
      
    } else {
      // START logic: No position, start immediately
      if (selectedStrategy) {
        try {
          await startStrategy(selectedStrategy);
          toast.success('Strategie gestart');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to start strategy';
          toast.error(errorMessage);
        }
      }
    }
  };

  const getStatusColor = (status: typeof strategyStatus) => {
    switch (status) {
      case 'stopped':
        return 'bg-muted/50 text-muted-foreground';
      case 'analyzing':
        return 'bg-accent/20 text-accent border border-accent/40';
      case 'active':
        return 'bg-success/20 text-success border border-success/40';
      case 'in-position':
        return 'bg-warning/20 text-warning border border-warning/40';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getStatusLabel = (status: typeof strategyStatus) => {
    // ALWAYS show status label - it should never be empty
    switch (status) {
      case 'stopped':
        return isStrategyRunningOnBackend ? null : 'Gestopt';
      case 'analyzing':
        return 'Analyseert';
      case 'active':
        return 'Actief';
      case 'in-position':
        return 'Gepauzeerd (Positie Open)';
      default:
        return 'Gestopt'; // Default fallback
    }
  };
  
  const handleRiskModeChange = (mode: 'percent' | 'fixed') => {
    const defaultValue = mode === 'percent' ? 1 : 10;
    const newSettings = { mode, value: defaultValue };
    setRiskSettings(newSettings);
    setSavedRiskSettings(newSettings);
  };
  
  const handleRiskValueChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      const roundedValue = Math.round(numValue * 10) / 10;
      const newSettings = { ...riskSettings, value: roundedValue };
      setRiskSettings(newSettings);
      setSavedRiskSettings(newSettings);
    }
  };
  
  const handleRiskIncrement = () => {
    const step = riskSettings.mode === 'percent' ? 0.5 : 10;
    const max = riskSettings.mode === 'percent' ? 50 : (usdcBalance ? usdcBalance * 0.5 : Infinity);
    const newValue = Math.min(riskSettings.value + step, max);
    const roundedValue = Math.round(newValue * 10) / 10;
    handleRiskValueChange(roundedValue.toString());
  };
  
  const handleRiskDecrement = () => {
    const step = riskSettings.mode === 'percent' ? 0.5 : 10;
    const min = riskSettings.mode === 'percent' ? 0.5 : 10;
    const newValue = Math.max(riskSettings.value - step, min);
    const roundedValue = Math.round(newValue * 10) / 10;
    handleRiskValueChange(roundedValue.toString());
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 p-4 sm:p-5 max-w-7xl mx-auto">
      <div className="flex-1 flex flex-col min-h-0 lg:w-1/2">
        <div className="glass-card rounded-2xl p-5 flex flex-col h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-5 flex-shrink-0">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Strategie</h2>
            <div className="flex items-center gap-2">
              {/* ALWAYS show status badge */}
              {getStatusLabel(actualStrategyStatus) && (
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getStatusColor(actualStrategyStatus)}`}
                >
                  {getStatusLabel(actualStrategyStatus)}
                </Badge>
              )}
              
              {strategyErrorLogs.length > 0 && (
                <button
                  onClick={() => setErrorLogsDialogOpen(true)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive hover:text-destructive transition-all relative"
                  title="Bekijk error logs"
                >
                  <Warning className="w-4 h-4" weight="fill" />
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-xs flex items-center justify-center"
                  >
                    {strategyErrorLogs.length}
                  </Badge>
                </button>
              )}
              {/* Show analysis details when strategy is actively running/monitoring */}
              {(actualStrategyStatus === 'analyzing' || actualStrategyStatus === 'active' || actualStrategyStatus === 'in-position' || isStrategyRunningOnBackend) && (
                <button
                  onClick={() => setAnalysisDialogOpen(true)}
                  className="p-1.5 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-accent transition-all"
                  title="Bekijk strategy monitoring details"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              {/* Show 24/7 badge when backend is running */}
              {isStrategyRunningOnBackend && (
                <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 text-xs">
                  ⚡ 24/7
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-4 flex-shrink-0">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Selecteer strategie</Label>
              <Select 
                value={selectedStrategy} 
                onValueChange={setSelectedStrategy} 
                disabled={actualStrategyStatus !== 'stopped' && !(actualStrategyStatus === 'in-position' && !strategy)}
              >
                <SelectTrigger className="bg-muted/30 border-border/30 h-11 rounded-lg">
                  <SelectValue placeholder="Kies een strategie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="razor">Razor</SelectItem>
                  <SelectItem value="thor">Thor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Risico per trade</Label>
              <Select 
                value={riskSettings.mode} 
                onValueChange={handleRiskModeChange} 
                disabled={actualStrategyStatus !== 'stopped' && !(actualStrategyStatus === 'in-position' && !strategy)}
              >
                <SelectTrigger className="bg-muted/30 border-border/30 h-11 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage van equity</SelectItem>
                  <SelectItem value="fixed">Vast bedrag (USDC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRiskDecrement}
                  disabled={actualStrategyStatus !== 'stopped' && !(actualStrategyStatus === 'in-position' && !strategy)}
                  className="flex items-center justify-center w-11 h-11 rounded-lg bg-muted/30 hover:bg-muted/50 text-foreground transition-all border border-border/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  <Minus className="w-4 h-4" weight="bold" />
                </button>
                <div className="flex-1 text-center py-2 px-4 rounded-lg bg-muted/20 border border-border/20">
                  <div className="text-3xl font-bold tracking-tight">
                    {riskSettings.mode === 'fixed' ? `$${riskSettings.value.toFixed(0)}` : `${riskSettings.value.toFixed(1)}%`}
                  </div>
                </div>
                <button
                  onClick={handleRiskIncrement}
                  disabled={actualStrategyStatus !== 'stopped' && !(actualStrategyStatus === 'in-position' && !strategy)}
                  className="flex items-center justify-center w-11 h-11 rounded-lg bg-muted/30 hover:bg-muted/50 text-foreground transition-all border border-border/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  <Plus className="w-4 h-4" weight="bold" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {riskSettings.mode === 'percent' 
                  ? 'Risico als percentage van equity'
                  : 'Risico in USDC per trade'}
              </p>
            </div>

            <Button
              onClick={handleStrategyToggle}
              disabled={
                !isConnected ||
                activePosition !== null || // CRITICAL: Can't start/stop during open position (store check)
                backendStatus.hasOpenPosition || // CRITICAL: Can't start/stop during open position (backend check)
                (!selectedStrategy && !isStrategyRunningOnBackend)
              }
              className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-lg transition-all disabled:opacity-50"
            >
              {/* Button text based on actualStrategyStatus */}
              {(activePosition || backendStatus.hasOpenPosition) ? (
                <>
                  <Pause className="w-5 h-5 mr-2" weight="fill" />
                  Positie Loopt
                </>
              ) : (actualStrategyStatus === 'analyzing' || actualStrategyStatus === 'active') ? (
                <>
                  <Pause className="w-5 h-5 mr-2" weight="fill" />
                  Stop Strategie
                </>
              ) : actualStrategyStatus === 'paused' ? (
                <>
                  <Play className="w-5 h-5 mr-2" weight="fill" />
                  Herstart Strategie
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" weight="fill" />
                  Start Strategie
                </>
              )}
            </Button>
            
            {(activePosition || backendStatus.hasOpenPosition) && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning">
                <p className="text-xs text-center">
                  ⚠️ Er staat een positie open. De strategie is gepauzeerd en zal automatisch herstarten na sluiten van de positie.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 lg:w-1/2">
        <CurrentPositionCard />
      </div>
      
      <AnalysisDetailsDialog 
        open={analysisDialogOpen}
        onOpenChange={setAnalysisDialogOpen}
      />

      <StrategyErrorLogsDialog
        open={errorLogsDialogOpen}
        onOpenChange={setErrorLogsDialogOpen}
        errorLogs={strategyErrorLogs}
        onClearLogs={clearStrategyErrorLogs}
      />
    </div>
  );
}
