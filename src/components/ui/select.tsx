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
  style,
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
            'block h-9 w-full truncate whitespace-nowrap appearance-none rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] [background-image:none] py-1.5 pl-3 pr-9 text-sm text-[#11221E] transition-colors focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20',
            className,
            '[appearance:none] [-webkit-appearance:none] [-moz-appearance:none] [&::-ms-expand]:hidden pr-9'
          )}
          style={{
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundImage: 'none',
            ...style,
          }}
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
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-[#415A54] dark:text-zinc-400"
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
        'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 text-sm text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-[#415A54] dark:text-zinc-400" strokeWidth={1.5} />
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
      {children ?? (ctx?.value ? ctx.value : <span className="text-[#5C7871] dark:text-zinc-500">{placeholder}</span>)}
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
        'absolute left-0 top-full z-50 mt-1 max-h-60 min-w-full overflow-auto rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-1 text-[#11221E] shadow-[0_4px_12px_rgba(17,34,30,0.08)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100',
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
        'relative flex cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-[#E8F3EF] dark:hover:bg-zinc-800',
        isSelected && 'bg-[#CBE8E2] font-medium text-[#0B4F4A] dark:bg-zinc-800/80 dark:text-teal-400',
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
    <div className={cn('px-2.5 py-1 text-xs font-semibold text-[#5C7871] dark:text-zinc-400', className)}>
      {children}
    </div>
  );
}
