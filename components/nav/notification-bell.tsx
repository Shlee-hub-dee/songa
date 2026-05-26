'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Placeholder notification button. Toggles a small popover that says "No new
// notifications". When a real notifications system lands (subscribing to
// the `officer:<id>` / `manager:<id>` Realtime topics already used by the
// approval/disbursal APIs), this component is where the unread count and
// dropdown list live.
export function NotificationBell() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors',
          'hover:bg-brand-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        )}
      >
        <Bell className="h-5 w-5" aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-40 w-64 rounded-lg border bg-card p-3 shadow-lg"
        >
          <p className="text-sm font-medium text-foreground">Notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">You&apos;re all caught up.</p>
        </div>
      ) : null}
    </div>
  );
}
