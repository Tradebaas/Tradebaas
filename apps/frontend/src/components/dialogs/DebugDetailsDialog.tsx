// Temporary stub: full dialog removed to keep TypeScript build clean.
// You can reintroduce a richer implementation later without affecting
// the rest of the trading logic.
import type { ReactNode } from 'react';

export interface DebugStep {
  id: string;
  label: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  message?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
}

export interface DebugInfo {
  title: string;
  description?: string;
  success: boolean;
  steps: DebugStep[];
  rawResponse?: unknown;
  suggestions?: string[];
}

interface DebugDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debugInfo: DebugInfo | null;
}

export function DebugDetailsDialog(_props: DebugDetailsDialogProps): ReactNode {
  return null;
}
