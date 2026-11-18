import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md border border-[#D5E3DF]/70 bg-[#E4EEEB] dark:border-transparent dark:bg-zinc-800/70',
        className
      )}
      {...props}
    />
  );
}
