import React from 'react';

type GapSize = 'sm' | 'md' | 'lg';

const gapClasses: Record<GapSize, string> = {
  sm: 'h-6 sm:h-8 lg:h-10',
  md: 'h-8 sm:h-10 lg:h-12',
  lg: 'h-10 sm:h-12 lg:h-16'
};

interface SectionSpacerProps {
  gap?: GapSize;
  ariaHidden?: boolean;
  className?: string;
}

export function SectionSpacer({ gap = 'md', ariaHidden = true, className }: SectionSpacerProps) {
  return <div className={`${gapClasses[gap]} ${className ?? ''}`.trim()} aria-hidden={ariaHidden} />;
}

export default SectionSpacer;
