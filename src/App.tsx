import { useState, useEffect } from 'react';
import { useTradingStore } from '@/state/store';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/pages/LoginPage';
import { StrategyTradingCard } from '@/components/trading/StrategyTradingCard';
import { MetricsPage } from '@/components/metrics/MetricsPage';
import { ConnectionStatusDialog } from '@/components/dialogs/ConnectionStatusDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { LicenseDialog } from '@/components/dialogs/LicenseDialog';
import { LegalDisclaimerDialog } from '@/components/dialogs/LegalDisclaimerDialog';
import { KillSwitchConfirmDialog } from '@/components/dialogs/KillSwitchConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { Power, Gear, ChartLine, Strategy, FileDashed, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { StatusPill } from '@/components/layout/StatusPill';
import { StrategiesPage } from '@/components/metrics/StrategiesPage';
import { AppFooter } from '@/components/layout/AppFooter';
import { PrivacyPolicyDialog } from '@/components/dialogs/PrivacyPolicyDialog';
import { useLicense } from '@/hooks/use-license';
import { useBackend } from '@/hooks/use-backend';
import { useKV } from '@/hooks/use-kv-polyfill';
import { backendAPI } from '@/lib/backend-api';
import logo from '@/assets/images/Icon_yellow.png';

type Page = 'trading' | 'metrics' | 'strategies';

function App() {
  const { connectionState, killSwitch, initializeClient, fetchUSDCBalance, usdcBalance, checkForOpenPosition, getClient, activePosition, loadSavedCredentials, connect } = useTradingStore();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const { entitlement, loading: licenseLoading } = useLicense();
  const { brokerName, entitlementTier, isLoading: backendLoading, error: backendError } = useBackend();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [killSwitchConfirmOpen, setKillSwitchConfirmOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('trading');
  const [disclaimerAcceptedRaw, setDisclaimerAcceptedRaw] = useKV('disclaimer-accepted', 'false');
  const [showFirstRunDisclaimer, setShowFirstRunDisclaimer] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [hasOpenPositions, setHasOpenPositions] = useState(false);
  const [openPositionsCount, setOpenPositionsCount] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [disclaimerDeclined, setDisclaimerDeclined] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const disclaimerAccepted = disclaimerAcceptedRaw === 'true';
  const tradingBlocked = disclaimerDeclined || !disclaimerAccepted;

  // Check authentication on mount
  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
      setAuthChecked(true);
    };
    initAuth();
  }, [checkAuth]);

  // Show login page if not authenticated
  if (!authChecked) {
    // Loading auth state
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <img src={logo} alt="Tradebaas" className="h-16 w-auto mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground text-sm">Laden...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  useEffect(() => {
    if (backendError) {
      if (backendError.includes('429') || backendError.includes('timeout') || backendError.includes('Backend')) {
        setInitError('Verbinding met backend vertraagd. App start met standaard instellingen.');
        setTimeout(() => setInitError(null), 4000);
      } else {
        console.warn('Backend error (non-critical):', backendError);
      }
    }
  }, [backendError]);

  useEffect(() => {
    const initializeApp = async () => {
      initializeClient();
      
      // Always start backend status polling to keep frontend in sync
      // This ensures frontend detects existing backend connections
      const store = useTradingStore.getState();
      store.startBackendStatusPolling();
      store.startRealTimeConnectionPolling();
      
      console.log('[App] Started backend status polling for connection sync');
      
      if (!disclaimerAccepted) {
        setShowFirstRunDisclaimer(true);
      }
    };

    initializeApp();
  }, [initializeClient, disclaimerAccepted]);

  useEffect(() => {
    if (connectionState === 'Active') {
      const startupDelay = setTimeout(async () => {
        await fetchUSDCBalance();
        await checkForOpenPosition();
        await checkOpenPositions();
      }, 1000);

      const interval = setInterval(() => {
        fetchUSDCBalance();
        checkOpenPositions();
      }, 15000);
      
      return () => {
        clearTimeout(startupDelay);
        clearInterval(interval);
      };
    }
  }, [connectionState, fetchUSDCBalance, checkForOpenPosition]);

  const checkOpenPositions = async () => {
    if (connectionState !== 'Active') return;

    try {
      // Use backend API instead of client
      const result = await backendAPI.getPositions();
      
      if (!result.success) {
        console.error('Failed to check open positions:', result.error);
        return;
      }
      
      const positions = result.positions;
      const openPositions = positions.filter(p => p.size !== 0);
      setHasOpenPositions(openPositions.length > 0);
      setOpenPositionsCount(openPositions.length);
    } catch (error) {
      console.error('Failed to check open positions:', error);
    }
  };

  const handleKillSwitchClick = () => {
    setKillSwitchConfirmOpen(true);
  };

  const handleKillSwitchConfirm = () => {
    killSwitch();
    toast.error('Systeem gestopt');
  };

  const handleFirstRunDisclaimerAccept = () => {
    setDisclaimerAcceptedRaw('true');
    setDisclaimerDeclined(false);
  };

  const handleFirstRunDisclaimerDecline = () => {
    setDisclaimerDeclined(true);
    toast.error('Trade functionaliteit is uitgeschakeld. Accepteer de disclaimer om te kunnen traden.');
  };

  const formatBalance = (balance: number | null): string => {
    if (balance === null) return '—';
    return balance.toFixed(0);
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {initError && (
        <div className="bg-warning/20 border-b border-warning/30 px-4 py-2 text-sm text-warning-foreground text-center">
          {initError}
        </div>
      )}
      
      <header className="border-b border-border/30 backdrop-blur-md bg-background/80 flex-shrink-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between relative">
          <div className="flex items-center gap-1.5">
            {(entitlement || entitlementTier !== 'free') && (
              <Badge
                variant="outline"
                className="flex cursor-pointer hover:bg-accent/10 transition-colors text-xs h-8 px-3"
                onClick={() => setLicenseDialogOpen(true)}
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                {(entitlement?.tier || entitlementTier).toUpperCase()}
              </Badge>
            )}
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <img src={logo} alt="Tradebaas" className="h-7 w-auto" />
          </div>
          
          <div className="flex items-center gap-1.5">
            {usdcBalance !== null && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-card/40 border border-border/20 text-xs">
                <span className="text-muted-foreground">USDC</span>
                <span className="font-medium">${formatBalance(usdcBalance)}</span>
              </div>
            )}
            <button
              onClick={() => setStatusDialogOpen(true)}
              className="h-9 w-9 p-0 rounded-md flex items-center justify-center hover:bg-muted/30 transition-colors"
            >
              <StatusPill state={connectionState} />
            </button>
            <Button
              onClick={() => setSettingsDialogOpen(true)}
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/30 h-9 w-9 p-0 rounded-md transition-colors"
            >
              <Gear className="w-5 h-5" />
            </Button>
            <Button
              onClick={handleKillSwitchClick}
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 p-0 rounded-md transition-colors"
            >
              <Power className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {currentPage === 'trading' ? (
          <StrategyTradingCard 
            tradingBlocked={tradingBlocked} 
            onOpenDisclaimer={() => setShowFirstRunDisclaimer(true)}
          />
        ) : currentPage === 'metrics' ? (
          <MetricsPage />
        ) : (
          <StrategiesPage />
        )}
      </main>

      <AppFooter currentPage={currentPage} onPageChange={setCurrentPage} />

      <div className="bg-background/95 border-t border-border/20 py-2 px-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <button
            onClick={() => setPrivacyDialogOpen(true)}
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <span>© {new Date().getFullYear()} Tradebaas</span>
        </div>
      </div>

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        onStatusClick={() => {
          setSettingsDialogOpen(false);
          setStatusDialogOpen(true);
        }}
        tradingBlocked={tradingBlocked}
        onOpenDisclaimer={() => setShowFirstRunDisclaimer(true)}
      />
      
      <ConnectionStatusDialog 
        open={statusDialogOpen} 
        onOpenChange={setStatusDialogOpen} 
      />

      <LicenseDialog
        open={licenseDialogOpen}
        onOpenChange={setLicenseDialogOpen}
      />

      <LegalDisclaimerDialog
        open={showFirstRunDisclaimer}
        onOpenChange={setShowFirstRunDisclaimer}
        onAccept={handleFirstRunDisclaimerAccept}
        onDecline={handleFirstRunDisclaimerDecline}
      />

      <PrivacyPolicyDialog
        open={privacyDialogOpen}
        onOpenChange={setPrivacyDialogOpen}
      />

      <KillSwitchConfirmDialog
        open={killSwitchConfirmOpen}
        onOpenChange={setKillSwitchConfirmOpen}
        onConfirm={handleKillSwitchConfirm}
        hasOpenPositions={hasOpenPositions}
        openPositionsCount={openPositionsCount}
      />

      <Toaster position="top-right" />
    </div>
  );
}

export default App;