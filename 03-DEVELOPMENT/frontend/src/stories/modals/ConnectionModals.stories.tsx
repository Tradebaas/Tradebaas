import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components';

const DemoWrapper: React.FC<{ children: (open: () => void) => React.ReactNode; title: string }>
= ({ children, title }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button variant="ghost" className="border border-white/10 text-white/85 hover:text-white" onClick={() => setOpen(true)}>
        Open: {title}
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size="md">
        {children(() => setOpen(false))}
      </Modal>
    </div>
  );
};

const meta = {
  title: 'Modals/Connection',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ErrorModal: Story = {
  render: () => (
    <DemoWrapper title="Connection Error">
      {() => (
        <div className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/90 mb-2">There was a problem connecting to the API</div>
            <pre className="text-xs text-white/80 whitespace-pre-wrap">HTTP 401 Unauthorized: invalid_client</pre>
          </div>
          <div className="text-xs text-white/60">Endpoint: <span className="font-mono">/api/deribit/balance?currency=USDC</span></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white">COPY ERROR</Button>
            <Button variant="ghost" size="sm" className="border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10">RETRY</Button>
          </div>
        </div>
      )}
    </DemoWrapper>
  )
};

export const ConnectedModal: Story = {
  render: () => (
    <DemoWrapper title="Connection Status">
      {() => (
        <div className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/90">API connection OK</div>
            <div className="text-xs text-white/70 mt-1">Endpoint: <span className="font-mono">/api/deribit/balance?currency=USDC</span></div>
            <div className="text-xs text-white/70 mt-1">Last checked: <span className="font-mono">17:46:51</span></div>
            <div className="text-xs text-white/70 mt-1">Last OK: <span className="font-mono">17:46:51</span></div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-white/70">Last successful response</div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 max-h-64 overflow-auto">
              <pre className="text-xs text-white/80 whitespace-pre-wrap">{`{
  "equity": 120.457924,
  "currency": "USDC",
  "summary": { "available_funds": 120.457924 }
}`}</pre>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white">COPY DETAILS</Button>
            <Button variant="ghost" size="sm" className="border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10">REFRESH</Button>
          </div>
        </div>
      )}
    </DemoWrapper>
  )
};
