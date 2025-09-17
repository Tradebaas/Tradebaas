import React from 'react';
import { cn } from '@/lib/utils';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

interface HeadingProps extends TypographyProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

const headingStyles = {
  1: 'text-4xl font-bold tracking-tight',
  2: 'text-3xl font-bold tracking-tight',
  3: 'text-2xl font-semibold tracking-tight',
  4: 'text-xl font-semibold tracking-tight',
  5: 'text-lg font-semibold',
  6: 'text-base font-semibold'
};

export function Heading({ children, level = 1, className }: HeadingProps) {
  const baseClassName = cn(
    'text-gray-900 dark:text-white',
    headingStyles[level],
    className
  );

  switch (level) {
    case 1:
      return <h1 className={baseClassName}>{children}</h1>;
    case 2:
      return <h2 className={baseClassName}>{children}</h2>;
    case 3:
      return <h3 className={baseClassName}>{children}</h3>;
    case 4:
      return <h4 className={baseClassName}>{children}</h4>;
    case 5:
      return <h5 className={baseClassName}>{children}</h5>;
    case 6:
      return <h6 className={baseClassName}>{children}</h6>;
    default:
      return <h1 className={baseClassName}>{children}</h1>;
  }
}

export function Text({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-gray-700 dark:text-gray-300 leading-relaxed', className)}>
      {children}
    </p>
  );
}

export function SmallText({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-sm text-gray-600 dark:text-gray-400', className)}>
      {children}
    </p>
  );
}

export function LargeText({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-lg text-gray-700 dark:text-gray-200 leading-relaxed', className)}>
      {children}
    </p>
  );
}

export function MutedText({ children, className }: TypographyProps) {
  return (
    <p className={cn('text-sm text-gray-500 dark:text-gray-500', className)}>
      {children}
    </p>
  );
}

export function Code({ children, className }: TypographyProps) {
  return (
    <code className={cn(
      'relative rounded bg-gray-100 dark:bg-brand-sage px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-gray-900 dark:text-brand-seafoam',
      className
    )}>
      {children}
    </code>
  );
}

interface MetricProps {
  value: string | number;
  label?: string;
  trend?: 'up' | 'down' | 'neutral';
  currency?: string;
  className?: string;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const metricSizes = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl'
};

export function Metric({ value, label, trend, currency, className, showLabel = true, size = 'md' }: MetricProps) {
  const trendColors = {
    up: 'text-brand-mint',
    down: 'text-rose-400/80', 
    neutral: 'text-white'
  };

  const formatValue = () => {
    if (currency && typeof value === 'number') {
      // Use consistent formatting to prevent hydration issues
      const formattedNumber = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
      return formattedNumber;
    }
    
    // Handle ratio values like "2.3:1" - split main value from ratio suffix
    if (typeof value === 'string' && value.includes(':')) {
      const parts = value.split(':');
      return {
        main: parts[0],
        suffix: ':' + parts.slice(1).join(':')
      };
    }
    
    return value;
  };

  return (
    <div className={cn('flex flex-col justify-center h-full text-center', className)}>
      {/* Titel alleen tonen als showLabel true is */}
      {showLabel && label && (
        <div className="text-xs font-medium pt-1 pb-2" style={{ color: '#86A694' }}>
          {label.toUpperCase()}
        </div>
      )}
      
      {/* Data gecentreerd */}
      <div className={cn(
        metricSizes[size],
        'font-semibold tabular-nums font-sans',
        trend ? trendColors[trend] : 'text-white'
      )}>
        {(() => {
          const formattedValue = formatValue();
          if (typeof formattedValue === 'object' && formattedValue !== null && 'main' in formattedValue && 'suffix' in formattedValue) {
            return (
              <>
                {formattedValue.main}
                <span className="text-xs" style={{ color: '#86A694' }}>
                  {formattedValue.suffix}
                </span>
              </>
            );
          }
          return String(formattedValue);
        })()}
      </div>
      
      {/* Reserveer altijd ruimte voor de currency-regel voor consistente uitlijning */}
      {currency ? (
        <div className="text-xs mt-1" style={{ color: '#86A694' }}>
          {currency}
        </div>
      ) : (
        <div className="text-xs mt-1 invisible select-none" aria-hidden="true">CUR</div>
      )}
    </div>
  );
}

interface PercentageProps {
  value: number;
  showSign?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

const percentageSizes = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base'
};

export function Percentage({ value, showSign = true, className, size = 'sm' }: PercentageProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  
  const colorClass = isPositive 
    ? 'text-brand-mint'
    : isNegative 
    ? 'text-rose-400/80'
    : 'text-gray-600 dark:text-gray-400';

  const sign = showSign && isPositive ? '+' : '';

  return (
    <span className={cn('font-sans font-medium tabular-nums', percentageSizes[size], colorClass, className)}>
      {sign}{value.toFixed(2)}%
    </span>
  );
}

interface PriceProps {
  value: number;
  currency: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const priceSizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
};

export function Price({ value, currency, size = 'sm', className }: PriceProps) {
  const formatPrice = () => {
    // Use consistent formatting to prevent hydration issues
    return new Intl.NumberFormat('en-US', { 
      minimumFractionDigits: currency === 'USDC' ? 2 : 8,
      maximumFractionDigits: currency === 'USDC' ? 2 : 8
    }).format(value);
  };

  return (
    <span className={cn(
      'font-sans font-medium tabular-nums text-gray-900 dark:text-white',
      priceSizes[size],
      className
    )}>
      {formatPrice()} {currency}
    </span>
  );
}