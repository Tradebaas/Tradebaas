import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components';

const meta = {
  title: 'Modals/ConfirmModal',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="p-6">
        <Button variant="ghost" className="border border-white/10 text-white/85 hover:text-white" onClick={() => setOpen(true)}>Open Confirm</Button>
        <ConfirmModal
          isOpen={open}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          title="Apply Settings"
          message="Are you sure you want to apply these settings?"
          confirmText="APPLY"
          cancelText="CANCEL"
          variant="primary"
        />
      </div>
    );
  }
};

export const Danger: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="p-6">
        <Button variant="ghost" className="border border-white/10 text-white/85 hover:text-white" onClick={() => setOpen(true)}>Open Danger Confirm</Button>
        <ConfirmModal
          isOpen={open}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          title="Stop Trading Card"
          message="This will stop market analysis for this card. Are you sure?"
          confirmText="STOP"
          cancelText="CANCEL"
          variant="danger"
        />
      </div>
    );
  }
};
