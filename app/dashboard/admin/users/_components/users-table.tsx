'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ALL_ROLES, ROLE_LABEL, type Role, type UnitLevel } from '@/lib/roles';
import { cn } from '@/lib/utils';

const UNIT_LEVELS: readonly (UnitLevel | '')[] = ['', 'ZONE', 'AREA', 'REGION'] as const;

const DATE = new Intl.DateTimeFormat('en-KE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  organisationalUnit: string | null;
  unitLevel: UnitLevel | null;
  managerEmail: string | null;
  managerName: string | null;
  tripsCount: number;
  joinedAtIso: string;
  isActive: boolean;
};

export function UsersTable({
  rows,
  managerOptions,
}: {
  rows: UserRow[];
  managerOptions: { email: string; name: string }[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function applyPatch(id: string, body: Record<string, unknown>) {
    setPendingId(id);
    setError(null);
    fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? `Update failed (${res.status})`);
        }
        startTransition(() => router.refresh());
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPendingId(null));
  }

  function doDelete(id: string) {
    setPendingId(id);
    setError(null);
    fetch(`/api/users/${id}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? `Delete failed (${res.status})`);
        }
        setConfirmDelete(null);
        startTransition(() => router.refresh());
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPendingId(null));
  }

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand-surface/60 text-left text-xs font-medium uppercase tracking-wide text-brand">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5">Unit</th>
              <th className="px-3 py-2.5">Manager</th>
              <th className="px-3 py-2.5 text-right">Trips</th>
              <th className="px-3 py-2.5">Joined</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((u) => {
              const busy = pendingId === u.id || isPending;
              return (
                <tr
                  key={u.id}
                  className={cn(
                    'transition-colors hover:bg-brand-surface/40',
                    !u.isActive && 'opacity-50',
                  )}
                >
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {u.name}
                    {!u.isActive ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        Inactive
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2.5">
                    <select
                      value={u.role}
                      disabled={busy || !u.isActive}
                      onChange={(e) => applyPatch(u.id, { role: e.target.value })}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={`Change role for ${u.name}`}
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <UnitEditor
                      userId={u.id}
                      unit={u.organisationalUnit}
                      level={u.unitLevel}
                      disabled={busy || !u.isActive}
                      onSave={(body) => applyPatch(u.id, body)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={u.managerEmail ?? ''}
                      disabled={busy || !u.isActive}
                      onChange={(e) =>
                        applyPatch(u.id, { managerEmail: e.target.value || null })
                      }
                      className="h-8 max-w-[180px] truncate rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={`Change manager for ${u.name}`}
                    >
                      <option value="">— No manager —</option>
                      {managerOptions
                        .filter((m) => m.email !== u.email)
                        .map((m) => (
                          <option key={m.email} value={m.email}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u.tripsCount}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {DATE.format(new Date(u.joinedAtIso))}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(u)}
                      disabled={busy || !u.isActive}
                      aria-label={`Deactivate ${u.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm-delete dialog */}
      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm deactivation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="w-full max-w-sm rounded-lg bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              Deactivate this user?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) won&apos;t
              be able to sign in. Their trip history stays so audits remain intact.
              You can re-enable them later via SQL or a future admin UI.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={pendingId === confirmDelete.id}
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doDelete(confirmDelete.id)}
                disabled={pendingId === confirmDelete.id}
                className="inline-flex h-9 items-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                {pendingId === confirmDelete.id ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function UnitEditor({
  userId,
  unit,
  level,
  disabled,
  onSave,
}: {
  userId: string;
  unit: string | null;
  level: UnitLevel | null;
  disabled: boolean;
  onSave: (body: { organisationalUnit: string | null; unitLevel: UnitLevel | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftUnit, setDraftUnit] = useState(unit ?? '');
  const [draftLevel, setDraftLevel] = useState<UnitLevel | ''>((level as UnitLevel) ?? '');

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraftUnit(unit ?? '');
          setDraftLevel((level as UnitLevel) ?? '');
          setEditing(true);
        }}
        disabled={disabled}
        className="text-left text-xs hover:underline disabled:cursor-default disabled:no-underline"
        aria-label={`Edit unit for user ${userId}`}
      >
        <span className="text-foreground">{unit ?? '—'}</span>
        {level ? (
          <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            ({level})
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={draftUnit}
        onChange={(e) => setDraftUnit(e.target.value)}
        placeholder="e.g. Nakuru West Zone"
        className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <select
        value={draftLevel}
        onChange={(e) => setDraftLevel(e.target.value as UnitLevel | '')}
        className="h-8 rounded-md border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {UNIT_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l || '—'}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          onSave({
            organisationalUnit: draftUnit.trim() || null,
            unitLevel: (draftLevel as UnitLevel) || null,
          });
          setEditing(false);
        }}
        className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white hover:bg-brand/90"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
