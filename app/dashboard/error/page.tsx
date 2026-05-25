import { ErrorReportForm } from './_components/error-report-form';

export default function ErrorReportPage() {
  return (
    <main className="mx-auto max-w-md p-4 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Help</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">Report a problem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what happened. We&apos;ll attach your device and app version automatically so
          you don&apos;t have to type them.
        </p>
      </header>
      <ErrorReportForm />
    </main>
  );
}
