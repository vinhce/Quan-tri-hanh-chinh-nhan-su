'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  initials?: string;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, name, initials, children, ...props }, ref) => {
    const derivedInitials = React.useMemo(() => {
      if (initials) return initials;
      if (!name) return null;
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }, [initials, name]);

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#C6D9D3] bg-[#E4EEEB] text-xs font-semibold text-[#0B4F4A] dark:border-zinc-800/80 dark:bg-zinc-800 dark:text-zinc-200',
          className
        )}
        {...props}
      >
        {children ?? (
          <span className="flex h-full w-full items-center justify-center">{derivedInitials}</span>
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

export const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, alt = '', ...props }, ref) => (
  <img
    ref={ref}
    alt={alt}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = 'AvatarImage';

export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-[#E4EEEB] text-xs font-semibold text-[#0B4F4A] dark:bg-zinc-800 dark:text-zinc-200',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = 'AvatarFallback';
