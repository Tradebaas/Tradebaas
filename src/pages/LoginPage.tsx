import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignIn, UserPlus, Envelope, Lock, User } from '@phosphor-icons/react';
import { toast } from 'sonner';
import logo from '@/assets/images/Icon_yellow.png';

export function LoginPage() {
  const { login, register, error, isLoading, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

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

    if (password.length < 12) {
      toast.error('Wachtwoord moet minimaal 12 tekens zijn');
      return;
    }

    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welkom terug!');
      } else {
        await register(email, password, fullName || undefined);
        toast.success('Account aangemaakt en ingelogd!');
      }
    } catch (err) {
      // Error already shown via useEffect
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
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

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
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

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <p>
            Door in te loggen ga je akkoord met onze voorwaarden
          </p>
        </div>
      </div>
    </div>
  );
}
