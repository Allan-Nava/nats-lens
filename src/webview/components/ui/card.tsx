import * as React from 'react';

function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// shadcn-style Card, themed via the Tailwind → --vscode-* color mapping.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-card p-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-xs uppercase tracking-wide text-muted', className)} {...props} />;
}

export function CardValue({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-1 text-2xl font-semibold', className)} {...props} />;
}
