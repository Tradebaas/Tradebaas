import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const modalSizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
};

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className 
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto outline-none focus:outline-none"
      onClick={handleBackdropClick}
    >
      {/* Enhanced backdrop with soft vignette and blur */}
      <div className="fixed inset-0 transition-all duration-300" style={{
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.65) 100%)',
        backdropFilter: 'blur(8px)'
      }} />
      
      {/* Modal with enhanced glassmorphism */}
      <div 
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          'relative w-full mx-4 my-8 rounded-xl shadow-2xl border border-white/10 overflow-hidden',
          modalSizes[size],
          className
        )}
        style={{ 
          background: 'linear-gradient(180deg, rgba(28, 31, 36, 0.85) 0%, rgba(28, 31, 36, 0.80) 100%)',
          backdropFilter: 'blur(18px) saturate(160%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 40px rgba(0,0,0,0.45)'
        }}
      >
        {/* Header with subtle gradient */}
        {title && (
          <div 
            className="flex items-center justify-between px-6 py-5 border-b border-white/10"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)'
            }}
          >
            <h3 className="text-base md:text-lg font-medium text-white/95 tracking-tight">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-all duration-200 p-2 rounded-lg hover:bg-white/10"
              style={{
                background: 'rgba(255, 255, 255, 0.04)'
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Content with subtle background */}
        <div className="px-6 py-5 text-white/90 text-sm md:text-base">
          {/* Consistente verticale spacing tussen teksten */}
          <div className="text-stack">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ModalActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalActions({ children, className }: ModalActionsProps) {
  return (
    <div className={cn('flex justify-end gap-3 pt-2', className)}>
      {children}
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary'
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-white/85">
        {message}
      </p>
      <ModalActions>
        <Button variant="ghost" className="border border-white/10 hover:border-white/15 text-white/85 hover:text-white" onClick={onClose}>
          {cancelText}
        </Button>
        {variant === 'danger' ? (
          <Button variant="ghost" className="border border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={handleConfirm}>
            {confirmText}
          </Button>
        ) : (
          <Button variant="ghost" className="border border-brand-mint/30 text-brand-mint hover:bg-brand-mint/10" onClick={handleConfirm}>
            {confirmText}
          </Button>
        )}
      </ModalActions>
    </Modal>
  );
}