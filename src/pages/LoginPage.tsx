import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SignIn, UserPlus, Envelope, Lock, User, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import logo from '@/assets/images/Icon_yellow.png';

export function LoginPage() {
  const { login, register, error, isLoading, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Vul alle velden in');
      return;
    }

    if (!disclaimerAccepted) {
      toast.error('Je moet de disclaimer accepteren om verder te gaan');
      return;
    }

    if (password.length < 12) {
      toast.error('Wachtwoord moet minimaal 12 tekens zijn');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      toast.error('Wachtwoorden komen niet overeen');
      return;
    }

    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welkom terug!');
      } else {
        await register(email, password, fullName || undefined, disclaimerAccepted);
        toast.success('Account aangemaakt en ingelogd!');
      }
    } catch (err) {
      // Error already shown via useEffect
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setConfirmPassword('');
    setDisclaimerAccepted(false);
    clearError();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="Tradebaas" className="h-16 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {mode === 'login' ? 'Welkom terug' : 'Account aanmaken'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === 'login' 
              ? 'Log in om te starten met traden' 
              : 'Maak een account aan om te beginnen'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium text-foreground">
                  Naam (optioneel)
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jan Jansen"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <div className="relative">
                <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="naam@voorbeeld.nl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Wachtwoord
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimaal 12 tekens"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  required
                />
              </div>
              {mode === 'register' && (
                <p className="text-xs text-muted-foreground">
                  Minimaal 12 tekens voor extra veiligheid
                </p>
              )}
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                  Bevestig wachtwoord
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Herhaal je wachtwoord"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-400">
                    Wachtwoorden komen niet overeen
                  </p>
                )}
              </div>
            )}

            {/* Disclaimer Section - Always visible for both login and register */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-3 p-4 bg-muted/30 border border-border rounded-lg hover:bg-muted/40 transition-colors">
                <Checkbox
                  id="disclaimer"
                  checked={disclaimerAccepted}
                  onCheckedChange={(checked) => setDisclaimerAccepted(checked === true)}
                  disabled={isLoading}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label
                    htmlFor="disclaimer"
                    className="text-sm font-medium text-foreground cursor-pointer leading-relaxed inline"
                  >
                    Ik heb de{' '}
                    <button
                      type="button"
                      onClick={() => setShowDisclaimer(true)}
                      className="text-sm font-semibold text-accent hover:text-accent/80 underline underline-offset-2 transition-colors"
                    >
                      voorwaarden
                    </button>
                    {' '}gelezen en ga akkoord met de risico's
                  </label>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !disclaimerAccepted}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {mode === 'login' ? 'Inloggen...' : 'Account aanmaken...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {mode === 'login' ? (
                    <>
                      <SignIn className="w-5 h-5" />
                      Inloggen
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5" />
                      Account aanmaken
                    </>
                  )}
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
              disabled={isLoading}
            >
              {mode === 'login' 
                ? 'Nog geen account? Registreer hier' 
                : 'Al een account? Log hier in'}
            </button>
          </div>
        </div>
      </div>

      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold">Risico Disclaimer</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDisclaimer(false)}
              >
                <span className="text-2xl">&times;</span>
              </Button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-sm space-y-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <h3 className="font-bold text-red-400 mb-2 flex items-center gap-2">
                  <Warning className="w-5 h-5" />
                  WAARSCHUWING: HOOG RISICO
                </h3>
                <p className="text-red-200">
                  Cryptovaluta trading met geautomatiseerde strategieën is buitengewoon risicovol en kan leiden tot het volledig verlies van uw kapitaal.
                </p>
              </div>

              <div className="space-y-3 text-muted-foreground">
                <h3 className="font-bold text-foreground">1. Algemene Risico's</h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Deze trading bot is een experimentele tool en komt ZONDER ENIGE GARANTIE</li>
                  <li>U kunt uw VOLLEDIGE investering verliezen</li>
                  <li>Geautomatiseerde trading kan leiden tot onverwachte verliezen door bugs, netwerkproblemen of marktvolatiliteit</li>
                  <li>Er is geen garantie op winst - historische resultaten zijn geen voorspeller van toekomstige prestaties</li>
                </ul>

                <h3 className="font-bold text-foreground mt-4">2. Technische Risico's</h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>De software kan bugs bevatten die leiden tot ongewenste trades</li>
                  <li>Netwerkproblemen kunnen ertoe leiden dat stop-losses niet worden geactiveerd</li>
                  <li>API-verbindingen met exchanges kunnen uitvallen</li>
                  <li>U bent volledig verantwoordelijk voor het monitoren van uw posities</li>
                </ul>

                <h3 className="font-bold text-foreground mt-4">3. Uw Verantwoordelijkheden</h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Test ALTIJD eerst met kleine bedragen of op testnet</li>
                  <li>Monitor uw posities regelmatig - de bot is NIET 100% betrouwbaar</li>
                  <li>Investeer alleen geld dat u zich kunt veroorloven te verliezen</li>
                  <li>Begrijp de strategieën die u gebruikt voordat u ze activeert</li>
                  <li>U bent zelf verantwoordelijk voor het veilig bewaren van uw API keys</li>
                </ul>

                <h3 className="font-bold text-foreground mt-4">4. Geen Financieel Advies</h3>
                <p>
                  Deze tool biedt GEEN financieel advies. De strategieën en signalen die worden gegenereerd zijn geautomatiseerde algoritmes en moeten niet worden beschouwd als professioneel beleggingsadvies. Raadpleeg altijd een gekwalificeerde financieel adviseur voordat u investeringsbeslissingen neemt.
                </p>

                <h3 className="font-bold text-foreground mt-4">5. Aansprakelijkheid</h3>
                <p>
                  De ontwikkelaars van Tradebaas aanvaarden GEEN aansprakelijkheid voor enig verlies, schade of winstderving als gevolg van het gebruik van deze software. U gebruikt deze tool op eigen risico.
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mt-6">
                <p className="text-sm text-amber-200">
                  <strong>Let op:</strong> Door het accepteren van deze disclaimer erkent u dat u de risico's volledig begrijpt en accepteert. U bent volledig verantwoordelijk voor uw eigen handelsbeslissingen en het beheer van uw kapitaal.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-border flex gap-3">
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => setShowDisclaimer(false)}
              >
                Sluiten
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setDisclaimerAccepted(true);
                  setShowDisclaimer(false);
                }}
              >
                Ik Begrijp de Risico's
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
