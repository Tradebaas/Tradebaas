import { ChartLine, ChartBar, ListChecks } from '@phosphor-icons/react';

type Page = 'trading' | 'metrics' | 'strategies' | 'admin';

interface AppFooterProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export function AppFooter({ currentPage, onPageChange }: AppFooterProps) {
  return (
    <footer className="border-t border-border/30 backdrop-blur-md bg-background/80 flex-shrink-0 sticky bottom-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <nav className="flex items-stretch h-16 gap-2">
          <button
            onClick={() => onPageChange('trading')}
            className={`flex-1 flex items-center justify-center transition-all duration-200 ${
              currentPage === 'trading'
                ? 'text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChartLine className="w-6 h-6" weight="regular" />
          </button>
          <button
            onClick={() => onPageChange('metrics')}
            className={`flex-1 flex items-center justify-center transition-all duration-200 ${
              currentPage === 'metrics'
                ? 'text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChartBar className="w-6 h-6" weight="regular" />
          </button>
          <button
            onClick={() => onPageChange('strategies')}
            className={`flex-1 flex items-center justify-center transition-all duration-200 ${
              currentPage === 'strategies'
                ? 'text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListChecks className="w-6 h-6" weight="regular" />
          </button>
        </nav>
      </div>
    </footer>
  );
}
