import React from 'react';
import { cn } from '@/lib/utils';

interface ContainerProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const containerSizes = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl', 
  lg: 'max-w-7xl',
  xl: 'max-w-8xl',
  full: 'max-w-full'
};

export function Container({ children, size = 'lg', className }: ContainerProps) {
  return (
    <div className={cn(
      'mx-auto px-4 sm:px-6 lg:px-8',
      containerSizes[size],
      className
    )}>
      {children}
    </div>
  );
}

interface GridProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: 2 | 3 | 4 | 6 | 8;
  className?: string;
}

const gridCols = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  6: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  12: 'grid-cols-12'
};

const gridGaps = {
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8'
};

export function Grid({ children, cols = 3, gap = 6, className }: GridProps) {
  return (
    <div className={cn(
      'grid',
      gridCols[cols],
      gridGaps[gap],
      className
    )}>
      {children}
    </div>
  );
}

interface FlexProps {
  children: React.ReactNode;
  direction?: 'row' | 'col';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  align?: 'start' | 'center' | 'end' | 'stretch';
  gap?: 2 | 3 | 4 | 6 | 8;
  className?: string;
}

const flexDirection = {
  row: 'flex-row',
  col: 'flex-col'
};

const flexJustify = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around'
};

const flexAlign = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch'
};

const flexGaps = {
  2: 'gap-2',
  3: 'gap-3', 
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8'
};

export function Flex({ 
  children, 
  direction = 'row', 
  justify = 'start', 
  align = 'start',
  gap = 4,
  className 
}: FlexProps) {
  return (
    <div className={cn(
      'flex',
      flexDirection[direction],
      flexJustify[justify],
      flexAlign[align],
      flexGaps[gap],
      className
    )}>
      {children}
    </div>
  );
}