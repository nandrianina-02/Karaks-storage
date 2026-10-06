import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const inputClass =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-60'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-24 py-2.5 leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(inputClass, 'appearance-none bg-[length:16px] pr-9', selectArrow, className)} {...props}>
      {children}
    </select>
  )
}

const selectArrow =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2374809a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-no-repeat bg-[position:right_0.65rem_center]"

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[0.8rem] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Checkbox({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-surface transition-colors',
        'checked:border-accent checked:bg-accent',
        "checked:bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5 10 17l9-10'/%3E%3C/svg%3E\")] bg-center bg-no-repeat bg-[length:12px]",
        'indeterminate:border-accent indeterminate:bg-accent',
        className,
      )}
      {...props}
    />
  )
}
