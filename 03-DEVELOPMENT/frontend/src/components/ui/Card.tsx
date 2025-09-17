import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
  variant?: 'default' | 'glass' | 'ghost';
}

const cardPadding = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6'
};


const cardRounded = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl'
};

export function Card({ 
  children, 
  className,
  padding = 'md',
  shadow = 'sm',
  rounded = 'lg',
  onClick,
  variant = 'default'
}: CardProps) {
  const Component = onClick ? 'button' : 'div';
  const isGlass = variant === 'glass';
  const isGhost = variant === 'ghost';
  
  return (
    <Component 
      onClick={onClick}
      className={cn(
        'border',
        cardPadding[padding],
        cardRounded[rounded],
        onClick && 'hover:opacity-90 transition-opacity',
        className
      )}
      style={{ 
        background: isGlass
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%)'
          : isGhost
          ? 'transparent'
          : '#3A3A3A',
        borderColor: isGlass
          ? 'rgba(255, 255, 255, 0.14)'
          : isGhost
          ? 'rgba(255, 255, 255, 0.08)'
          : 'rgba(0, 0, 0, 0.2)',
        boxShadow: isGlass
          ? '0 6px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
          : isGhost
          ? 'none'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.3)'
      }}
    >
      {children}
    </Component>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 pb-2', className)}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function CardTitle({ children, className, onClick, style }: CardTitleProps) {
  if (onClick) {
    return (
      <button 
        onClick={onClick} 
        className={cn('text-lg font-semibold text-gray-900 dark:text-white hover:opacity-80 transition-opacity cursor-pointer', className)}
        style={style}
      >
        {children}
      </button>
    );
  }
  
  return (
    <h3 className={cn('text-lg font-semibold text-gray-900 dark:text-white', className)} style={style}>
      {children}
    </h3>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn('text-gray-600 dark:text-gray-300', className)}>
      {children}
    </div>
  );
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('mt-4 pt-2 border-t border-gray-200 dark:border-brand-sage', className)}>
      {children}
    </div>
  );
}