'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { ALL_ROLES, ROLE_LABEL, type Role, type UnitLevel } from '@/lib/roles';

// Modal-form "Add user" button. Calls POST /api/users which sends a Supabase
// auth invite to the email AND upserts the public.users row in one step.

export function AddUserButton({
  managerOptions,
}: {
  managerOptions: { email: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    const form = e.currentTarget;
    const data = new FormData(form);
    const role = data.get('role') as Role;
    const unitLevel = (data.get('unitLevel') as UnitLevel | '') || null;
    const body = {
      email: String(data.get('email') ?? '').trim().toLowerCase(),
      name: String(data.get('name') ?? '').trim(),
      role,
      managerEmail: String(data.get('managerEmail') ?? '').trim() || undefined,
      organisationalUnit:
        String(data.get('organisationalUnit') ?? '').trim() || undefined,
      unitLevel: unitLevel ?? undefined,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { user?: unknown; invited?: boolean; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(json?.error ?? `Could not create user (${res.status})`);
      }
      setSuccess(
        json?.invited
          ? 'Invitation email sent. The user will receive a link to set their password.'
          : 'User created. Auth account already existed; profile updated.',
      );
      form.reset();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add user
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add user"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-foreground">Add a user</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <p className="mb-4 text-xs text-muted-foreground">
              Sends a Supabase invitation email and links the user to a public profile
              row with the chosen role.
            </p>

            <form onSubmit={onSubmit} className="space-y-3">
              <Field label="Email" htmlFor="add-user-email">
                <input
                  required
                  id="add-user-email"
                  name="email"
                  type="email"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="Full name" htmlFor="add-user-name">
                <input
                  required
                  id="add-user-name"
                  name="name"
                  type="text"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="Role" htmlFor="add-user-role">
                <select
                  required
                  id="add-user-role"
                  name="role"
                  defaultValue="TUPANDE_AGENT"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Line manager (optional)" htmlFor="add-user-manager">
                <select
                  id="add-user-manager"
                  name="managerEmail"
                  defaultValue=""
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— No manager —</option>
                  {managerOptions.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field
                    label="Organisational unit (optional)"
                    htmlFor="add-user-unit"
                  >
                    <input
                      id="add-user-unit"
                      name="organisationalUnit"
                      type="text"
                      placeholder="e.g. Nakuru West Zone"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </Field>
                </div>
                <Field label="Level" htmlFor="add-user-level">
                  <select
                    id="add-user-level"
                    name="unitLevel"
                    defaultValue=""
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">—</option>
                    <option value="ZONE">ZONE</option>
                    <option value="AREA">AREA</option>
                    <option value="REGION">REGION</option>
                  </select>
                </Field>
              </div>

              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
              ) : null}
              {success ? (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {success}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
                >
                  {submitting ? 'Inviting…' : 'Invite user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
