import { ConnectionState } from '@/lib/deribitClient';
import { cn } from '@/lib/utils';

interface StatusPillProps {
  state: ConnectionState;
  className?: string;
}

const stateConfig: Record<ConnectionState, { color: string }> = {
  Stopped: {
    color: 'bg-muted-foreground',
  },
  Connecting: {
    color: 'bg-accent',
  },
  Analyzing: {
    color: 'bg-accent',
  },
  Active: {
    color: 'bg-success',
  },
  Error: {
    color: 'bg-destructive',
  },
};

export function StatusPill({ state, className }: StatusPillProps) {
  const config = stateConfig[state];
  
  return (
    <div 
      className={cn(
        'w-2 h-2 rounded-full transition-all shadow-sm',
        state === 'Active' && 'animate-pulse-glow',
        config.color, 
        className
      )}
      aria-label="Connection status"
    />
  );
}