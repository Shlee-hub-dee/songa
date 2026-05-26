import { ChevronRight } from 'lucide-react';

// Server-rendered hierarchy crumb walked from the approver's manager chain.
// Layout examples:
//   RM "David Kiprop"   → Rift Valley Region
//   AC "Mercy Wairimu"  → Rift Valley Region → Nakuru Area
//   ZS "Peter Macharia" → Rift Valley Region → Nakuru Area → Nakuru West Zone
//
// The walk happens in the parent page where Prisma is in scope; this
// component just renders the resulting list.

export function HierarchyBreadcrumb({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;
  return (
    <nav
      aria-label="Org hierarchy"
      className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
    >
      {parts.map((p, i) => (
        <span key={`${i}-${p}`} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
          ) : null}
          <span
            className={
              i === parts.length - 1
                ? 'rounded-full bg-brand-surface px-2 py-0.5 font-medium text-brand'
                : ''
            }
          >
            {p}
          </span>
        </span>
      ))}
    </nav>
  );
}
