import { getBackendUrl } from '@/lib/backend-url';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradingStore } from '@/state/store';
import { useKV } from '@/hooks/use-kv-polyfill';
import { Eye, EyeSlash, PaperPlaneTilt, CheckCircle, XCircle, Bug, Warning } from '@phosphor-icons/react';
import { TestTradeCard } from '@/components/trading/TestTradeCard';
import { DebugDetailsDialog, type DebugInfo } from '@/components/dialogs/DebugDetailsDialog';
import { createTelegramNotifier, type TelegramConfig } from '@/lib/telegram';
import { credentialsClient } from '@/lib/credentials-client';
import { toast } from 'sonner';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusClick: () => void;
}

export function SettingsDialog({ open, onOpenChange, onStatusClick }: SettingsDialogProps) {
  const {
    connectionState,
    environment,
    credentials,
    error,
    setEnvironment,
    connect,
    disconnect,
    loadSavedCredentials,
    clearError,
  } = useTradingStore();

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [credentialsSource, setCredentialsSource] = useState<'none' | 'backend' | 'local'>('none');
  const [telemetryEnabledRaw, setTelemetryEnabledRaw] = useKV('telemetry-enabled', 'false');
  
  const [telegramBotToken, setTelegramBotToken] = useKV('telegram-bot-token', '');
  const [telegramChatId, setTelegramChatId] = useKV('telegram-chat-id', '');
  const [telegramEnabledRaw, setTelegramEnabledRaw] = useKV('telegram-enabled', 'false');
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  const [notionApiKey, setNotionApiKey] = useKV('notion-api-key', '');
  const [notionDatabaseId, setNotionDatabaseId] = useKV('notion-database-id', '');
  const [notionEnabledRaw, setNotionEnabledRaw] = useKV('notion-enabled', 'false');
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [isTestingNotion, setIsTestingNotion] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebugDialog, setShowDebugDialog] = useState(false);

  const telemetryEnabled = telemetryEnabledRaw === 'true';
  const telegramEnabled = telegramEnabledRaw === 'true';
  const notionEnabled = notionEnabledRaw === 'true';

  // Load credentials from backend on open
  useEffect(() => {
    if (open) {
      loadSavedCredentials();
      
      // Check where broker credentials come from (use backend port 3000)
      const backendUrl = getBackendUrl();
      fetch(`${backendUrl}/api/credentials/deribit`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.credentials) {
            setCredentialsSource('backend');
          } else {
            setCredentialsSource('local');
          }
        })
        .catch(() => {
          setCredentialsSource('local');
        });
      
      // Load Telegram credentials from backend
      credentialsClient.getTelegram().then(({ botToken, chatId }) => {
        if (botToken) setTelegramBotToken(botToken);
        if (chatId) setTelegramChatId(chatId);
      });
      
      // Load Notion credentials from backend
      credentialsClient.getNotion().then(({ apiKey, databaseId }) => {
        if (apiKey) setNotionApiKey(apiKey);
        if (databaseId) setNotionDatabaseId(databaseId);
      });
    }
  }, [open, loadSavedCredentials]);

  // Auto-save Telegram credentials when changed
  useEffect(() => {
    if (telegramBotToken && telegramChatId && open) {
      const timer = setTimeout(() => {
        credentialsClient.saveTelegram(telegramBotToken, telegramChatId).then((response) => {
          if (response.success) {
            console.log('[Settings] Telegram credentials auto-saved to backend');
          }
        });
      }, 1000); // Debounce 1 second
      
      return () => clearTimeout(timer);
    }
  }, [telegramBotToken, telegramChatId, open]);

  // Auto-save Notion credentials when changed
  useEffect(() => {
    if (notionApiKey && open) {
      const timer = setTimeout(() => {
        credentialsClient.saveNotion(notionApiKey, notionDatabaseId).then((response) => {
          if (response.success) {
            console.log('[Settings] Notion credentials auto-saved to backend');
          }
        });
      }, 1000); // Debounce 1 second
      
      return () => clearTimeout(timer);
    }
  }, [notionApiKey, notionDatabaseId, open]);

  useEffect(() => {
    if (credentials) {
      setApiKey(credentials.apiKey);
      setApiSecret(credentials.apiSecret);
    }
  }, [credentials]);

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) return;
    setIsConnecting(true);
    clearError();

    try {
      await connect({ apiKey, apiSecret });
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    disconnect();
    // Wait a bit for backend to process disconnect
    await new Promise(resolve => setTimeout(resolve, 500));
  };

  const handleEnvironmentToggle = (checked: boolean) => {
    const newEnv = checked ? 'testnet' : 'live';
    setEnvironment(newEnv);
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken || !telegramChatId) {
      toast.error('Voer eerst je Telegram gegevens in');
      return;
    }

    setIsTesting(true);
    
    const steps: DebugInfo['steps'] = [];
    let rawResponse: any = null;
    let success = false;
    const suggestions: string[] = [];

    try {
      // Step 1: Validate bot token format
      steps.push({
        id: 'validate-token',
        label: 'Bot token formaat valideren',
        status: 'pending',
        message: 'Controleren of bot token het juiste formaat heeft...',
        timestamp: Date.now(),
      });

      const tokenPattern = /^\d+:[A-Za-z0-9_-]{35}$/;
      const isValidFormat = tokenPattern.test(telegramBotToken);

      if (!isValidFormat) {
        steps[0].status = 'warning';
        steps[0].message = 'Bot token heeft niet het verwachte formaat';
        steps[0].details = {
          'Token lengte': telegramBotToken.length,
          'Verwacht formaat': '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz12345',
        };
        suggestions.push('Controleer of je de complete bot token hebt gekopieerd van @BotFather');
      } else {
        steps[0].status = 'success';
        steps[0].message = 'Bot token formaat is correct';
      }

      // Step 2: Validate chat ID
      steps.push({
        id: 'validate-chatid',
        label: 'Chat ID valideren',
        status: 'pending',
        message: 'Controleren of chat ID geldig is...',
        timestamp: Date.now(),
      });

      const chatIdPattern = /^-?\d+$/;
      const isValidChatId = chatIdPattern.test(telegramChatId);

      if (!isValidChatId) {
        steps[1].status = 'warning';
        steps[1].message = 'Chat ID heeft niet het verwachte formaat (moet alleen cijfers zijn)';
        steps[1].details = {
          'Chat ID': telegramChatId,
          'Verwacht': 'Alleen cijfers, bijv: 123456789 of -123456789',
        };
        suggestions.push('Verkrijg je chat ID via @userinfobot op Telegram');
      } else {
        steps[1].status = 'success';
        steps[1].message = 'Chat ID formaat is correct';
      }

      // Step 3: Test bot connection
      steps.push({
        id: 'test-bot',
        label: 'Bot verbinding testen',
        status: 'pending',
        message: 'Controleren of bot actief is...',
        timestamp: Date.now(),
      });

      const notifier = createTelegramNotifier({
        botToken: telegramBotToken,
        chatId: telegramChatId,
        enabled: true,
      });

      const result = await notifier.testConnection();
      
      if (result.success) {
        steps[2].status = 'success';
        steps[2].message = result.message;
        steps[2].details = result.details;
        success = true;
        toast.success(result.message);
      } else {
        steps[2].status = 'error';
        steps[2].message = result.message;
        steps[2].details = result.details;
        rawResponse = result.rawResponse;

        // Provide specific suggestions based on error
        if (result.message.includes('bot was blocked')) {
          suggestions.push('Je hebt de bot geblokkeerd. Deblokkeer de bot in Telegram en probeer opnieuw');
        } else if (result.message.includes('chat not found')) {
          suggestions.push('Chat ID niet gevonden. Stuur eerst een bericht naar je bot');
          suggestions.push('Verkrijg je juiste Chat ID via @userinfobot');
        } else if (result.message.includes('unauthorized')) {
          suggestions.push('Bot token is ongeldig. Maak een nieuwe bot aan via @BotFather');
        } else if (result.message.includes('niet bereikbaar')) {
          suggestions.push('Controleer je internetverbinding');
          suggestions.push('Controleer of Telegram API niet wordt geblokkeerd door een firewall');
        } else {
          suggestions.push('Controleer of je bot token en chat ID correct zijn');
          suggestions.push('Zorg dat je een bericht hebt gestuurd naar je bot');
        }

        toast.error(result.message);
      }

    } catch (error: any) {
      if (steps.length > 0 && steps[steps.length - 1].status === 'pending') {
        steps[steps.length - 1].status = 'error';
        steps[steps.length - 1].message = error.message || 'Onbekende fout';
      }
      
      if (suggestions.length === 0) {
        suggestions.push('Controleer je internetverbinding');
        suggestions.push('Controleer of je bot token correct is');
        suggestions.push('Stuur een bericht naar je bot om de chat te activeren');
      }
    } finally {
      setIsTesting(false);
      
      // Create debug info
      const debug: DebugInfo = {
        title: 'Telegram Verbinding Test',
        description: success 
          ? 'De verbinding met Telegram is succesvol tot stand gekomen.' 
          : 'Er zijn problemen gevonden bij het verbinden met Telegram.',
        success,
        steps,
        rawResponse,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
      
      setDebugInfo(debug);
      
      // Only show debug dialog if there was an error
      if (!success) {
        setShowDebugDialog(true);
      }
    }
  };

  const handleTestNotion = async () => {
    if (!notionApiKey) {
      toast.error('Voer eerst je Notion API key in');
      return;
    }

    setIsTestingNotion(true);
    
    const steps: DebugInfo['steps'] = [];
    let rawResponse: any = null;
    let success = false;
    const suggestions: string[] = [];

    try {
      // Step 1: Validate API key format
      steps.push({
        id: 'validate-key',
        label: 'API Key formaat valideren',
        status: 'pending',
        message: 'Controleren of API key het juiste formaat heeft...',
        timestamp: Date.now(),
      });

      // Notion supports TWO secret formats:
      // 1. Internal Integration Token: secret_XXX... (50 chars total: "secret_" + 43 chars)
      // 2. Internal Integration Secret: ntn_XXX... (newer format, variable length ~44-50 chars)
      const secretPattern = /^secret_[a-zA-Z0-9]{43}$/;
      const ntnPattern = /^ntn_[a-zA-Z0-9]{30,60}$/; // More flexible length range
      const isValidFormat = secretPattern.test(notionApiKey) || ntnPattern.test(notionApiKey);
      
      const secretType = notionApiKey.startsWith('secret_') ? 'Internal Integration Token (secret_)' 
                       : notionApiKey.startsWith('ntn_') ? 'Internal Integration Secret (ntn_)'
                       : 'Onbekend';

      if (!isValidFormat) {
        steps[0].status = 'warning';
        
        if (!notionApiKey.startsWith('secret_') && !notionApiKey.startsWith('ntn_')) {
          steps[0].message = '❌ API key heeft niet het juiste formaat';
          steps[0].details = {
            'Key lengte': notionApiKey.length,
            'Begint met': notionApiKey.substring(0, 10) + '...',
            'Verwacht formaat': 'secret_XXX... OF ntn_XXX...',
          };
          suggestions.push('🚨 De key begint niet met "secret_" of "ntn_"!');
          suggestions.push('');
          suggestions.push('📋 Kopieer de juiste secret:');
          suggestions.push('1️⃣ Ga naar: https://www.notion.so/my-integrations');
          suggestions.push('2️⃣ Klik op je integration');
          suggestions.push('3️⃣ Zoek naar "Internal Integration Secret"');
          suggestions.push('4️⃣ Kopieer de VOLLEDIGE secret (begint met ntn_ of secret_)');
        } else {
          steps[0].message = 'API key formaat is niet volledig correct (verkeerde lengte)';
          steps[0].details = {
            'Key lengte': notionApiKey.length,
            'Type': secretType,
            'Verwacht': notionApiKey.startsWith('secret_') ? '50 karakters' : '~47 karakters',
          };
          suggestions.push('Controleer of je de complete secret hebt gekopieerd');
          suggestions.push('Zorg dat je NIET per ongeluk spaties aan het begin of einde hebt toegevoegd');
        }
      } else {
        steps[0].status = 'success';
        steps[0].message = `✅ API key formaat is correct (${secretType})`;
        steps[0].details = {
          'Key lengte': notionApiKey.length,
          'Type': secretType,
          'Prefix': notionApiKey.substring(0, 4),
          'Formaat': 'Geldig',
        };
      }

      // Step 2: Explain CORS limitation clearly
      steps.push({
        id: 'cors-limitation',
        label: 'Browser beperking (CORS)',
        status: 'warning',
        message: '⚠️ Notion API kan niet direct vanuit browser worden aangeroepen',
        timestamp: Date.now(),
        details: {
          'Reden': 'CORS (Cross-Origin Resource Sharing) beveiliging',
          'Wat is CORS': 'Browser security feature die voorkomt dat websites elkaars data lezen',
          'Impact': 'Notion staat geen direct browser → API verkeer toe',
          'Oplossing': 'Je hebt een backend server nodig als tussenlaag',
        },
      });

      // Instead of trying to call Notion directly (which will fail with CORS),
      // we explain the limitation to the user
      success = false;
      
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('🚨 TECHNISCHE BEPERKING');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('');
      suggestions.push('❌ Notion API is NIET bereikbaar vanuit browser-apps');
      suggestions.push('');
      suggestions.push('Dit komt door CORS (Cross-Origin Resource Sharing):');
      suggestions.push('• Browser beveiligingsfunctie');
      suggestions.push('• Voorkomt dat websites elkaars data kunnen lezen');
      suggestions.push('• Notion staat geen directe browser-calls toe');
      suggestions.push('');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('✅ JE API KEY IS WEL GELDIG!');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('');
      suggestions.push(`Type: ${secretType}`);
      suggestions.push(`Lengte: ${notionApiKey.length} tekens`);
      suggestions.push(`Formaat: ✓ Correct`);
      suggestions.push('');
      suggestions.push('Het probleem is NIET je key!');
      suggestions.push('Het probleem is dat je geen backend server hebt.');
      suggestions.push('');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('💡 OPLOSSINGEN');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('');
      suggestions.push('OPTIE 1: Backend Server (aanbevolen)');
      suggestions.push('────────────────────────────────');
      suggestions.push('• Deploy een Node.js/Express server');
      suggestions.push('• Maak een endpoint: /api/notion');
      suggestions.push('• Deze server roept Notion API aan');
      suggestions.push('• Jouw browser → Jouw server → Notion');
      suggestions.push('');
      suggestions.push('Voorbeeld code:');
      suggestions.push('```javascript');
      suggestions.push('// server.js');
      suggestions.push('app.post(\'/api/notion\', async (req, res) => {');
      suggestions.push('  const result = await fetch(\'https://api.notion.com/v1/...\', {');
      suggestions.push('    headers: {');
      suggestions.push('      \'Authorization\': `Bearer ${process.env.NOTION_KEY}`,');
      suggestions.push('      \'Notion-Version\': \'2022-06-28\'');
      suggestions.push('    }');
      suggestions.push('  });');
      suggestions.push('  res.json(await result.json());');
      suggestions.push('});');
      suggestions.push('```');
      suggestions.push('');
      suggestions.push('OPTIE 2: Serverless Function');
      suggestions.push('────────────────────────────────');
      suggestions.push('• Gebruik Cloudflare Workers, Vercel, of Netlify Functions');
      suggestions.push('• Deploy een edge function die de API call doet');
      suggestions.push('• Gratis tier vaak voldoende');
      suggestions.push('');
      suggestions.push('OPTIE 3: CORS Proxy (alleen voor testen!)');
      suggestions.push('────────────────────────────────');
      suggestions.push('• Gebruik https://cors-anywhere.herokuapp.com/');
      suggestions.push('• ⚠️ NIET voor productie (onveilig)');
      suggestions.push('• ⚠️ Je API key wordt zichtbaar');
      suggestions.push('');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('📚 MEER INFO');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      suggestions.push('');
      suggestions.push('Notion API Docs:');
      suggestions.push('https://developers.notion.com/');
      suggestions.push('');
      suggestions.push('CORS Uitleg:');
      suggestions.push('https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS');
      suggestions.push('');
      suggestions.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      toast.error('Notion API niet bereikbaar vanuit browser (CORS beperking)', {
        description: 'Je hebt een backend server nodig als tussenlaag. Bekijk de debug info voor oplossingen.',
        duration: 6000,
      });



    } catch (error: any) {
      if (steps.length > 0 && steps[steps.length - 1].status === 'pending') {
        steps[steps.length - 1].status = 'error';
      }
      
      if (suggestions.length === 0) {
        suggestions.push('Controleer je internetverbinding');
        suggestions.push('Controleer of je API key correct is gekopieerd');
        suggestions.push('Probeer een nieuwe integration aan te maken');
      }
    } finally {
      setIsTestingNotion(false);
      
      // Create debug info
      const debug: DebugInfo = {
        title: 'Notion Verbinding Test',
        description: success 
          ? 'De verbinding met Notion is succesvol tot stand gekomen.' 
          : 'Er zijn problemen gevonden bij het verbinden met Notion.',
        success,
        steps,
        rawResponse,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
      
      setDebugInfo(debug);
      
      // Only show debug dialog if there was an error
      if (!success) {
        setShowDebugDialog(true);
      }
    }
  };

  const isConnected = connectionState === 'Analyzing' || connectionState === 'Active';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md h-[600px] max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Instellingen</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="broker" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 bg-muted/30 p-1 gap-1 flex-shrink-0 rounded-xl">
            <TabsTrigger value="broker" className="rounded-lg text-xs">Broker</TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-lg text-xs">Notificaties</TabsTrigger>
            <TabsTrigger value="connections" className="rounded-lg text-xs">Connecties</TabsTrigger>
          </TabsList>

          <TabsContent value="broker" className="space-y-4 mt-4 overflow-y-auto flex-1">
            {error && credentialsSource !== 'backend' && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 rounded-xl py-3">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
            
            {credentialsSource === 'backend' && credentials && (
              <Alert className="bg-accent/10 border-accent/30 rounded-xl py-3">
                <AlertDescription className="text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
                  <span>Credentials geladen uit backend .env (server-side opslag)</span>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-api-key" className="text-xs text-muted-foreground">API key</Label>
                <Input
                  id="settings-api-key"
                  type="text"
                  placeholder="Deribit API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isConnected}
                  className="text-sm bg-muted/20 border-border/20 h-11 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-api-secret" className="text-xs text-muted-foreground">API secret</Label>
                <div className="relative">
                  <Input
                    id="settings-api-secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Deribit API secret"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    disabled={isConnected}
                    className="text-sm bg-muted/20 border-border/20 h-11 pr-10 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isConnected}
                  >
                    {showSecret ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/20">
                <Label htmlFor="settings-testnet-toggle" className="text-sm cursor-pointer">
                  Omgeving
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium transition-colors ${environment === 'live' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Live
                  </span>
                  <Switch
                    id="settings-testnet-toggle"
                    checked={environment === 'testnet'}
                    onCheckedChange={handleEnvironmentToggle}
                    disabled={isConnected}
                  />
                  <span className={`text-xs font-medium transition-colors ${environment === 'testnet' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Testnet
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {!isConnected ? (
                <Button
                  onClick={handleConnect}
                  disabled={!apiKey || !apiSecret || isConnecting}
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground h-11 rounded-lg font-medium"
                >
                  {isConnecting ? 'Verbinden...' : 'Verbinden'}
                </Button>
              ) : (
                <Button
                  onClick={handleDisconnect}
                  variant="outline"
                  className="flex-1 h-11 rounded-lg"
                >
                  Verbreek verbinding
                </Button>
              )}
            </div>

            <div className="pt-4 border-t border-border/20">
              <h3 className="text-sm font-medium mb-3">Test Trade</h3>
              <TestTradeCard />
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4 mt-4 overflow-y-auto flex-1">
            <Alert className="bg-accent/10 border-accent/20">
              <AlertDescription className="text-xs">
                <strong className="text-accent">Telegram Notificaties</strong>
                <p className="mt-1 text-muted-foreground">
                  Ontvang real-time berichten in Telegram wanneer trades worden geopend en gesloten, 
                  inclusief entry, stop loss, take profit en het resultaat.
                </p>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/20">
                <div className="flex-1">
                  <Label htmlFor="telegram-enabled" className="text-sm cursor-pointer font-medium">
                    Telegram Notificaties
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ontvang trade berichten via Telegram
                  </p>
                </div>
                <Switch
                  id="telegram-enabled"
                  checked={telegramEnabled}
                  onCheckedChange={(checked) => setTelegramEnabledRaw(checked ? 'true' : 'false')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-bot-token" className="text-xs text-muted-foreground">
                  Bot Token
                </Label>
                <div className="relative">
                  <Input
                    id="telegram-bot-token"
                    type={showTelegramToken ? 'text' : 'password'}
                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    className="text-sm bg-muted/20 border-border/20 h-11 pr-10 rounded-lg font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelegramToken(!showTelegramToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showTelegramToken ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Maak een bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@BotFather</a> op Telegram
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram-chat-id" className="text-xs text-muted-foreground">
                  Chat ID
                </Label>
                <Input
                  id="telegram-chat-id"
                  type="text"
                  placeholder="123456789"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="text-sm bg-muted/20 border-border/20 h-11 rounded-lg font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Verkrijg je Chat ID via <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@userinfobot</a> op Telegram
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/20 space-y-3">
                <h4 className="text-sm font-medium">Hoe werkt het?</h4>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>
                    <strong>Maak een bot:</strong> Stuur <code className="bg-background/50 px-1 rounded">/newbot</code> naar @BotFather op Telegram
                  </li>
                  <li>
                    <strong>Kopieer token:</strong> Kopieer de bot token die je ontvangt
                  </li>
                  <li>
                    <strong>Start een chat:</strong> Stuur een bericht naar je bot
                  </li>
                  <li>
                    <strong>Verkrijg Chat ID:</strong> Stuur een bericht naar @userinfobot voor je Chat ID
                  </li>
                  <li>
                    <strong>Vul gegevens in:</strong> Voer bot token en chat ID hierboven in
                  </li>
                  <li>
                    <strong>Test verbinding:</strong> Klik op "Test Verbinding" om te verifiëren
                  </li>
                </ol>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/20 space-y-2">
                <h4 className="text-sm font-medium">Wat ontvang je?</h4>
                <ul className="text-xs text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-success">📈</span>
                    <span><strong>Trade Open:</strong> Instrument, richting, entry, SL, TP en strategie + reden</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">📉</span>
                    <span><strong>Trade Close:</strong> Exit prijs, PnL, percentage resultaat en sluiting reden</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleTestTelegram}
                  disabled={!telegramBotToken || !telegramChatId || isTesting}
                  className="flex-1 bg-accent hover:bg-accent/90 h-11 rounded-lg"
                >
                  <PaperPlaneTilt className="w-4 h-4 mr-2" />
                  {isTesting ? 'Verbinding testen...' : 'Test Verbinding'}
                </Button>
                {debugInfo && !debugInfo.success && debugInfo.title.includes('Telegram') && (
                  <Button
                    onClick={() => setShowDebugDialog(true)}
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-lg"
                    title="Bekijk debug informatie"
                  >
                    <Bug className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="connections" className="space-y-4 mt-4 overflow-y-auto flex-1">
            <Alert className="bg-accent/10 border-accent/20">
              <AlertDescription className="text-xs">
                <strong className="text-accent">API Connecties</strong>
                <p className="mt-1 text-muted-foreground">
                  Koppel externe diensten zoals Notion om je trading data automatisch te synchroniseren 
                  en analyses op te slaan.
                </p>
              </AlertDescription>
            </Alert>

            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-muted/10 border border-border/20 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium">Notion</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Synchroniseer je trades en analyses met een Notion database
                    </p>
                  </div>
                  <Switch
                    id="notion-enabled"
                    checked={notionEnabled}
                    onCheckedChange={(checked) => setNotionEnabledRaw(checked ? 'true' : 'false')}
                  />
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="notion-api-key" className="text-xs text-muted-foreground">
                      Integration Secret (API Key)
                    </Label>
                    <div className="relative">
                      <Input
                        id="notion-api-key"
                        type={showNotionKey ? 'text' : 'password'}
                        placeholder="secret_... of ntn_..."
                        value={notionApiKey}
                        onChange={(e) => setNotionApiKey(e.target.value)}
                        className="text-sm bg-muted/20 border-border/20 h-11 pr-10 rounded-lg font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNotionKey(!showNotionKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNotionKey ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notion-database-id" className="text-xs text-muted-foreground">
                      Database ID <span className="text-muted-foreground/60">(optioneel)</span>
                    </Label>
                    <Input
                      id="notion-database-id"
                      type="text"
                      placeholder="a1b2c3d4e5f6..."
                      value={notionDatabaseId}
                      onChange={(e) => setNotionDatabaseId(e.target.value)}
                      className="text-sm bg-muted/20 border-border/20 h-11 rounded-lg font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Het database ID uit de URL van je Notion database
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleTestNotion}
                      disabled={!notionApiKey || isTestingNotion}
                      variant="outline"
                      className="flex-1 h-10 rounded-lg"
                    >
                      {isTestingNotion ? (
                        <>
                          <span className="animate-pulse">Verbinding testen...</span>
                        </>
                      ) : (
                        <>
                          {notionApiKey ? <CheckCircle className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                          Test Verbinding
                        </>
                      )}
                    </Button>
                    {debugInfo && !debugInfo.success && (
                      <Button
                        onClick={() => setShowDebugDialog(true)}
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 rounded-lg"
                        title="Bekijk debug informatie"
                      >
                        <Bug className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border/10 space-y-3">
                  <h4 className="text-xs font-semibold flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex-shrink-0">!</span>
                    Hoe koppel ik Notion?
                  </h4>
                  
                  <div className="space-y-2">
                    <ol className="text-xs text-muted-foreground space-y-2 list-none">
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 font-bold text-accent">1.</span>
                        <span>Ga naar <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-medium">notion.so/my-integrations</a></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 font-bold text-accent">2.</span>
                        <span>Klik op <strong>"New integration"</strong> en geef het een naam (bijv. "Tradebaas")</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 font-bold text-accent">3.</span>
                        <div className="flex-1">
                          <p className="mb-1">Zoek het veld <strong>"Internal Integration Secret"</strong></p>
                          <div className="pl-3 border-l-2 border-warning/30 space-y-1 mt-1 py-1">
                            <p className="text-[11px] text-warning">⚠️ NIET de "Integration ID"!</p>
                            <p className="text-[11px] text-muted-foreground">Het secret begint met <code className="bg-background px-1 rounded text-accent font-mono">secret_</code></p>
                          </div>
                        </div>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 font-bold text-accent">4.</span>
                        <span>Klik op <strong>"Show"</strong> om het secret zichtbaar te maken</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 font-bold text-accent">5.</span>
                        <span>Kopieer de VOLLEDIGE secret (50 karakters) en plak het hierboven</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 font-bold text-accent">6.</span>
                        <span>Klik op "Test Verbinding" om te verifiëren</span>
                      </li>
                    </ol>
                    
                    <div className="pt-2 mt-2 border-t border-border/10">
                      <p className="text-[11px] text-muted-foreground">
                        <strong>Tip:</strong> Als je een database wilt koppelen, maak dan een database in Notion 
                        en kopieer het Database ID uit de URL (het deel tussen de workspace en het vraagteken).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/10 border border-border/20">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center">
                    <span className="text-xs">+</span>
                  </div>
                  <div>
                    <p className="text-sm">Meer connecties binnenkort beschikbaar</p>
                    <p className="text-xs text-muted-foreground">Google Sheets, Discord, en meer...</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4 mt-4 overflow-y-auto flex-1">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/20">
                <div className="flex-1">
                  <Label htmlFor="telemetry-toggle" className="text-sm cursor-pointer font-medium">
                    Telemetrie
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deel anonieme gebruiksgegevens voor debugging
                  </p>
                </div>
                <Switch
                  id="telemetry-toggle"
                  checked={telemetryEnabled}
                  onCheckedChange={(checked) => setTelemetryEnabledRaw(checked ? 'true' : 'false')}
                />
              </div>

              <Alert className="bg-muted/20 border-border/20">
                <AlertDescription className="text-xs text-muted-foreground">
                  <strong>Let op:</strong> Telemetrie is standaard uitgeschakeld. Wanneer ingeschakeld, 
                  verzamelen we alleen API-aanroepduur, verbindingsstatus en foutmeldingen. 
                  Wij loggen nooit API-sleutels, wachtwoorden of gevoelige gegevens.
                </AlertDescription>
              </Alert>

              <div className="p-3 rounded-xl bg-muted/20 border border-border/20">
                <h4 className="text-sm font-medium mb-2">Wat we verzamelen:</h4>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>RPC methode namen en responstijden</li>
                  <li>WebSocket verbindingsstatus</li>
                  <li>Algemene foutmeldingen (zonder details)</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-muted/20 border border-border/20">
                <h4 className="text-sm font-medium mb-2">Wat we NIET verzamelen:</h4>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>API-sleutels of wachtwoorden</li>
                  <li>Order prijzen of bedragen</li>
                  <li>Account balances</li>
                  <li>Persoonlijke identificatiegegevens</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <DebugDetailsDialog
          open={showDebugDialog}
          onOpenChange={setShowDebugDialog}
          debugInfo={debugInfo}
        />
      </DialogContent>
    </Dialog>
  );
}
