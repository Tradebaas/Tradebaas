import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: string;
  className?: string;
}

export function KPICard({ label, value, className }: KPICardProps) {
  return (
    <div className={cn('glass-card rounded-lg p-3 flex flex-col gap-1 min-w-0', className)}>
      <span className="text-xs text-muted-foreground truncate">
        {label}
      </span>
      <span className="text-base font-medium text-foreground truncate">
        {value}
      </span>
    </div>
  );
}