import * as React from 'react';

function cn(...p: Array<string | false | undefined>): string {
  return p.filter(Boolean).join(' ');
}

const fieldCls =
  'w-full rounded border border-input-border bg-input px-2 py-1 text-input-fg outline-none focus:border-accent';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldCls, 'font-mono', className)} {...props} />;
}

export function Button({
  className,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const styles =
    variant === 'primary'
      ? 'bg-accent text-accent-fg hover:bg-accent-hover border-transparent'
      : 'bg-transparent text-fg hover:bg-card border-border';
  return <button className={cn('rounded border px-3 py-1', styles, className)} {...props} />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs uppercase tracking-wide text-muted">{children}</label>;
}
