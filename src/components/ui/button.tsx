import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

import { Spinner } from '@/components/brand/loader'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface border border-line-strong text-ink hover:bg-surface-2 hover:border-ink-2/40',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border border-transparent',
  'danger-ghost': 'border border-danger/40 text-danger hover:bg-danger-soft',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-[0.8rem]',
  md: 'h-10 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-4 text-[0.95rem]',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }

export function LinkButton({ variant = 'secondary', size = 'md', icon, className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  )
}

export function IconButton({
  label,
  className,
  children,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
