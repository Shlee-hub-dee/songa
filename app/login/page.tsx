import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getAuthedUser } from '@/lib/supabase-server';
import { LoginForm } from './_components/login-form';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: { redirectedFrom?: string; signedOut?: string };
};

// Only allow same-origin relative paths. Anything else (absolute URLs,
// protocol-relative `//evil.com`, missing leading slash) falls back to
// /dashboard so we can't be tricked into bouncing users off-site.
function safeRedirectTarget(input: string | undefined): string {
  if (!input) return '/dashboard';
  if (!input.startsWith('/')) return '/dashboard';
  if (input.startsWith('//')) return '/dashboard';
  return input;
}

export default async function LoginPage({ searchParams }: Props) {
  const user = await getAuthedUser();
  const target = safeRedirectTarget(searchParams.redirectedFrom);

  // Already signed in? Skip the form and go where they were headed.
  if (user) redirect(target);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-surface p-4 sm:p-6">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <Image
              src="/tupande-logo.jpg"
              alt="Tupande"
              width={160}
              height={90}
              priority
              className="h-auto w-40 rounded-lg shadow-sm"
            />
          </div>
          <h1 className="mt-3 text-3xl font-bold text-brand">Songa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to log trips and submit reimbursement claims.
          </p>
        </header>

        {searchParams.signedOut ? (
          <p className="mb-4 rounded-md border border-brand/20 bg-white px-3 py-2 text-center text-sm text-brand">
            You&apos;ve been signed out. See you again soon.
          </p>
        ) : null}

        <LoginForm redirectTo={target} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Trouble signing in?{' '}
          <a href="/dashboard/error" className="text-brand underline-offset-2 hover:underline">
            Report it
          </a>{' '}
          and a manager will reach out.
        </p>
      </div>
    </main>
  );
}
