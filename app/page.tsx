import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          One Acre Fund
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">Songa</h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          Field Transport Manager — move forward with simple, mobile-first reimbursement.
        </p>
      </div>
      <div className="flex gap-3">
        <Button>Log a trip</Button>
        <Button variant="outline">Sign in</Button>
      </div>
    </main>
  );
}
