'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectContextValue {
  value: string;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  options?: SelectOption[];
  children?: React.ReactNode;
}

export function Select({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  onChange,
  options,
  className,
  children,
  ...rest
}: SelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string>(defaultValue);
  const [open, setOpen] = React.useState<boolean>(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : uncontrolledValue;

  const handleValueChange = React.useCallback(
    (nextVal: string) => {
      if (controlledValue === undefined) {
        setUncontrolledValue(nextVal);
      }
      onValueChange?.(nextVal);
      setOpen(false);
    },
    [controlledValue, onValueChange]
  );

  React.useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // Detect if used as a native <select> (with options prop, onChange, or <option> children)
  const hasNativeOptions =
    Boolean(options) ||
    Boolean(onChange) ||
    React.Children.toArray(children).some(
      (child) => React.isValidElement(child) && child.type === 'option'
    );

  if (hasNativeOptions) {
    return (
      <div className="relative inline-flex w-full items-center">
        <select
          value={currentValue}
          onChange={(e) => {
            onChange?.(e);
            handleValueChange(e.target.value);
          }}
          className={cn(
            'flex h-9 w-full appearance-none rounded-lg border border-zinc-200/80 bg-white py-1.5 pl-3 pr-8 text-sm text-zinc-900 transition-colors focus-visible:border-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20',
            className
          )}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-zinc-500 dark:text-zinc-400"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  return (
    <SelectContext.Provider
      value={{ value: currentValue, onValueChange: handleValueChange, open, setOpen }}
    >
      <div ref={containerRef} className={cn('relative inline-block w-full', className)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={ctx?.open}
      onClick={(e) => {
        ctx?.setOpen((prev) => !prev);
        onClick?.(e);
      }}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-sm text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:border-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />
    </button>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

export function SelectValue({
  placeholder,
  children,
}: {
  placeholder?: string;
  children?: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);
  return (
    <span className="truncate">
      {children ?? (ctx?.value ? ctx.value : <span className="text-zinc-400">{placeholder}</span>)}
    </span>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(SelectContext);
  if (!ctx?.open) return null;
  return (
    <div
      role="listbox"
      className={cn(
        'absolute left-0 top-full z-50 mt-1 max-h-60 min-w-full overflow-auto rounded-lg border border-zinc-200/80 bg-white p-1 text-zinc-900 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx?.value === value;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => ctx?.onValueChange(value)}
      className={cn(
        'relative flex cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
        isSelected && 'bg-zinc-100/80 font-medium text-teal-700 dark:bg-zinc-800/80 dark:text-teal-400',
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {isSelected && <Check className="ml-2 h-4 w-4 shrink-0" strokeWidth={1.5} />}
    </div>
  );
}

export function SelectGroup({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('py-1', className)}>{children}</div>;
}

export function SelectLabel({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400', className)}>
      {children}
    </div>
  );
}
