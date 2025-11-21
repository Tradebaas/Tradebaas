import { useBrokers } from '@/hooks/use-brokers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, ArrowClockwise } from '@phosphor-icons/react';

export function BrokerList() {
  const { brokers, loading, error, refetch } = useBrokers();

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Error Loading Brokers
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={refetch} variant="outline" size="sm">
              <ArrowClockwise className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Supported Brokers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {brokers.length} brokers available for trading
          </p>
        </div>
        <Button onClick={refetch} variant="outline" size="sm">
          <ArrowClockwise className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brokers.map((broker) => (
          <Card key={broker.name} className="glass-card hover:bg-card/90 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <img 
                    src={broker.logoURL} 
                    alt={broker.name}
                    className="w-8 h-8 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div>
                    <CardTitle className="text-lg">{broker.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Max Leverage: {broker.maxLeverage}x
                    </CardDescription>
                  </div>
                </div>
                {broker.hasTestnet && (
                  <Badge variant="outline" className="text-xs">
                    Testnet
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Base Currencies</p>
                <div className="flex flex-wrap gap-1">
                  {broker.baseCurrencies.slice(0, 4).map((currency) => (
                    <Badge key={currency} variant="secondary" className="text-xs">
                      {currency}
                    </Badge>
                  ))}
                  {broker.baseCurrencies.length > 4 && (
                    <Badge variant="secondary" className="text-xs">
                      +{broker.baseCurrencies.length - 4}
                    </Badge>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Supported Pairs ({broker.supportedPairs.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {broker.supportedPairs.slice(0, 3).map((pair) => (
                    <Badge key={pair} variant="outline" className="text-xs font-mono">
                      {pair}
                    </Badge>
                  ))}
                  {broker.supportedPairs.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{broker.supportedPairs.length - 3}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-border/30">
                <a
                  href={broker.apiDocsURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
                >
                  API Documentation →
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
