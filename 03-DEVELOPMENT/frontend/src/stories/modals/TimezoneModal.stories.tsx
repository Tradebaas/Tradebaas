import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components';

type TZ = { name: string; value: string; label: string };

const TIMEZONE_OPTIONS: TZ[] = [
  { name: 'Nederland', value: 'Europe/Amsterdam', label: 'CET/CEST' },
  { name: 'UTC', value: 'UTC', label: 'UTC' },
  { name: 'New York', value: 'America/New_York', label: 'EST/EDT' },
  { name: 'London', value: 'Europe/London', label: 'GMT/BST' },
  { name: 'Tokyo', value: 'Asia/Tokyo', label: 'JST' },
  { name: 'Sydney', value: 'Australia/Sydney', label: 'AEST/AEDT' }
];

const DemoWrapper: React.FC<{ title: string }> = ({ title }) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TZ>(TIMEZONE_OPTIONS[0]);
  return (
    <div className="p-6">
      <Button
        variant="ghost"
        className="border border-white/10 text-white/85 hover:text-white"
        onClick={() => setOpen(true)}
      >
        Open: {title}
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size="sm">
        <div className="space-y-3">
          <div className="space-y-2">
            {TIMEZONE_OPTIONS.map((tz) => (
              <button
                key={tz.value}
                onClick={() => {
                  setSelected(tz);
                  setOpen(false);
                }}
                className={
                  `w-full text-left px-4 py-3 rounded-lg transition-all duration-200 border ` +
                  (selected.value === tz.value
                    ? 'border-white/15 text-white'
                    : 'border-white/10 text-white/80 hover:text-white hover:border-white/15')
                }
                style={{
                  backgroundColor: selected.value === tz.value
                    ? 'rgba(255, 255, 255, 0.07)'
                    : 'rgba(255, 255, 255, 0.04)',
                  boxShadow: selected.value === tz.value
                    ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
                    : 'none'
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{tz.name}</span>
                  <span className="text-xs font-mono" style={{ color: '#86A694' }}>{tz.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

const meta = {
  title: 'Modals/Timezone',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const TimezoneModal: Story = {
  render: () => <DemoWrapper title="Select Timezone" />
};
