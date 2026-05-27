import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { TRIP_TYPE_LABEL, type TripType } from '@/lib/active-trip';
import { PaymentForm } from './_components/payment-form';
import { SubmitForApprovalButton } from './_components/submit-button';

type Props = { params: { id: string } };

const STATUS_STYLES: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'bg-gray-100 text-gray-700' },
  PENDING: { label: 'Pending review', tone: 'bg-blue-50 text-blue-700' },
  APPROVED: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Rejected', tone: 'bg-red-50 text-red-700' },
  REIMBURSED: { label: 'Reimbursed', tone: 'bg-brand-surface text-brand' },
};

const fmtKes = (v: number | bigint) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(Number(v));

export default async function TripDetailPage({ params }: Props) {
  const trip = await prisma.trip.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      approver: { select: { id: true, name: true } },
      payment: true,
    },
  });
  if (!trip) notFound();

  const status = STATUS_STYLES[trip.status] ?? STATUS_STYLES.DRAFT;

  return (
    <main className="mx-auto max-w-md p-4 sm:p-6 tablet:max-w-4xl">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">Trip</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          {TRIP_TYPE_LABEL[trip.type as TripType]}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}
          >
            {status.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(trip.startTime).toLocaleString()}
          </span>
        </div>
      </header>

      <div className="grid gap-6 tablet:grid-cols-2">
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Officer" value={trip.user.name} />
          <Field label="Distance" value={`${Number(trip.distanceKm).toFixed(2)} km`} />
          <Field label="Rate" value={`${fmtKes(Number(trip.ratePerKm))}/km`} />
          <Field label="Amount" value={fmtKes(Number(trip.amountKes))} />
          {trip.approver ? <Field label="Approved by" value={trip.approver.name} /> : null}
          {trip.gpsAccuracyM != null ? (
            <Field label="Best GPS" value={`${Number(trip.gpsAccuracyM).toFixed(0)} m`} />
          ) : null}
        </dl>
        {trip.notes ? (
          <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">{trip.notes}</p>
        ) : null}
      </section>

      <div>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          M-Pesa payment
        </h2>
        {trip.payment ? (
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Reference" value={trip.payment.mpesaRef} mono />
              <Field label="Amount" value={fmtKes(Number(trip.payment.amountKes))} />
              <Field label="Recipient" value={trip.payment.recipientPhone} />
              <Field
                label="Paid at"
                value={new Date(trip.payment.paidAt).toLocaleString()}
              />
            </dl>
            {trip.payment.screenshotPath ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Screenshot on file ({trip.payment.screenshotPath})
              </p>
            ) : null}
          </div>
        ) : trip.status === 'DRAFT' || trip.status === 'APPROVED' ? (
          <PaymentForm
            tripId={trip.id}
            expectedAmount={Number(trip.amountKes)}
            defaultPhone={trip.user.phone ?? undefined}
          />
        ) : (
          <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">
            Payment was not attached. Awaiting reviewer.
          </p>
        )}
      </section>

      {trip.status === 'DRAFT' ? (
        <section className="mt-6">
          <SubmitForApprovalButton tripId={trip.id} hasPayment={!!trip.payment} />
        </section>
      ) : null}
      </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-medium text-foreground ${mono ? 'font-mono text-sm' : 'text-sm'}`}
      >
        {value}
      </dd>
    </div>
  );
}
