"use client";
import React, { useEffect, useState } from 'react';
import { LastUpdatedProvider, useLastUpdated } from '@/context/LastUpdatedContext';
import Header from './Header';
import { ModeProvider } from '@/context/ModeContext';
import { BotsProvider } from '@/context/BotsContext';

interface RootLayoutProps {
  children: React.ReactNode;
}

function FooterContent() {
  const [timeText, setTimeText] = useState<string>('');
  // Always call the hook (no conditional)
  const ctx = useLastUpdated();
  const lastUpdated: Date | null = ctx?.lastUpdated ?? null;
  useEffect(() => {
    if (lastUpdated) {
      const formatted = new Intl.DateTimeFormat('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(lastUpdated);
      setTimeText(formatted);
    }
  }, [lastUpdated]);
  return (
    <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <div
        className="px-4 py-3 rounded-xl border text-xs text-white/70"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(255, 255, 255, 0.12)'
        }}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-center sm:text-left">© 2025 Tradebaas - USDC Futures Trading Platform</p>
          <p className="text-center sm:text-right font-sans tabular-nums tracking-wide" suppressHydrationWarning>
            {timeText ? `Last updated ${timeText}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <ModeProvider>
      <LastUpdatedProvider>
        <BotsProvider>
        <div className="min-h-screen font-sans text-sm md:text-base leading-relaxed antialiased" style={{ backgroundColor: '#252823' }}>
          <div className="flex flex-col min-h-screen">
            {/* New Header Component */}
            <Header />

            {/* Main content area */}
            <main className="flex-1 overflow-hidden" style={{ backgroundColor: '#252823' }}>
              <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-24 py-6">
                {children}
              </div>
            </main>

            {/* Footer: glass-styled, consistent with app */}
            <footer className="border-t border-white/10 py-4 bg-transparent">
              <FooterContent />
            </footer>
          </div>
        </div>
        </BotsProvider>
      </LastUpdatedProvider>
    </ModeProvider>
  );
}