import type { FC } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        verified: 'border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.12)] text-[#10B981]',
        pending: 'border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.12)] text-[#F59E0B]',
        threat: 'border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.12)] text-[#EF4444]',
        neutral: 'border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.12)] text-[#3B82F6]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode;
  className?: string;
}

const StatusBadge: FC<StatusBadgeProps> = ({ variant, children, className }) => {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      <span
        className={cn('h-1.5 w-1.5 rounded-full', {
          'bg-[#10B981]': variant === 'verified',
          'bg-[#F59E0B]': variant === 'pending',
          'bg-[#EF4444]': variant === 'threat',
          'bg-[#3B82F6]': variant === 'neutral' || !variant,
        })}
      />
      {children}
    </span>
  );
};

export default StatusBadge;
