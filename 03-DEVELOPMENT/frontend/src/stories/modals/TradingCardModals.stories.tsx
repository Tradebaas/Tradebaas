import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components';

const meta = {
  title: 'Modals/TradingCard',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const StrategyInfo: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="p-6">
        <Button variant="ghost" className="border border-white/10 text-white/85 hover:text-white" onClick={() => setOpen(true)}>
          Open Strategy Info
        </Button>
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Momentum Breakout" size="md">
          <div className="space-y-5">
            <p className="text-white/85">
              Uses recent volatility and volume to identify breakout opportunities. Confirms with RSI and EMA alignment.
            </p>
          </div>
        </Modal>
      </div>
    );
  }
};

export const ErrorDetails: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const error = 'Order placement failed: insufficient funds for requested position size. Required: 250.00 USDC, Available: 120.46 USDC.';
    return (
      <div className="p-6">
        <Button variant="ghost" className="border border-white/10 text-white/85 hover:text-white" onClick={() => setOpen(true)}>
          Open Error Details
        </Button>
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Error Details" size="md">
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <pre className="text-sm text-red-400 whitespace-pre-wrap">{error}</pre>
            </div>
            <Button
              onClick={() => navigator.clipboard.writeText(error)}
              variant="ghost"
              size="sm"
              className="w-full border border-white/10 hover:border-white/15 text-white/85 hover:text-white"
            >
              COPY ERROR
            </Button>
          </div>
        </Modal>
      </div>
    );
  }
};
