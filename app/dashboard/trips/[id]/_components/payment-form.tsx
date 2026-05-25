'use client';

import { useState } from 'react';
import imageCompression from 'browser-image-compression';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const MAX_BYTES_AFTER_COMPRESSION = 500 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Mode = 'manual' | 'upload';

type Props = {
  tripId: string;
  expectedAmount: number;
  defaultPhone?: string;
};

export function PaymentForm({ tripId, expectedAmount, defaultPhone }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('manual');
  const [mpesaRef, setMpesaRef] = useState('');
  const [amount, setAmount] = useState<string>(expectedAmount.toFixed(2));
  const [phone, setPhone] = useState(defaultPhone ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressedKb, setCompressedKb] = useState<number | null>(null);

  async function compressIfNeeded(input: File): Promise<File> {
    if (input.size <= MAX_BYTES_AFTER_COMPRESSION) return input;
    return imageCompression(input, {
      maxSizeMB: MAX_BYTES_AFTER_COMPRESSION / (1024 * 1024),
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      // Keep original mime when possible so the signed URL path extension matches.
      fileType: input.type,
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = e.target.files?.[0];
    if (!picked) {
      setFile(null);
      setCompressedKb(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setError('Use a JPEG, PNG, or WebP image.');
      return;
    }
    setCompressing(true);
    try {
      const out = await compressIfNeeded(picked);
      if (out.size > MAX_BYTES_AFTER_COMPRESSION) {
        setError(
          `Image is still ${(out.size / 1024).toFixed(0)}KB after compression. Try a smaller photo.`,
        );
        setFile(null);
        setCompressedKb(null);
      } else {
        setFile(out);
        setCompressedKb(Math.round(out.size / 1024));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compress image');
      setFile(null);
    } finally {
      setCompressing(false);
    }
  }

  async function uploadScreenshot(picked: File): Promise<string> {
    const urlRes = await fetch('/api/storage/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId,
        contentType: picked.type,
        size: picked.size,
      }),
    });
    if (!urlRes.ok) {
      throw new Error((await safeMessage(urlRes)) ?? 'Could not get upload URL');
    }
    const { path, token } = (await urlRes.json()) as { path: string; token: string };
    const { error: uploadError } = await supabase.storage
      .from('mpesa-screenshots')
      .uploadToSignedUrl(path, token, picked, { contentType: picked.type });
    if (uploadError) throw uploadError;
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = Number(amount);
    if (!mpesaRef.trim()) return setError('M-Pesa reference is required.');
    if (!Number.isFinite(amountNum) || amountNum <= 0) return setError('Amount must be > 0.');
    if (!phone.trim()) return setError('Recipient phone is required.');
    if (mode === 'upload' && !file) return setError('Pick a screenshot or switch to manual entry.');

    setSubmitting(true);
    try {
      let screenshotPath: string | undefined;
      if (mode === 'upload' && file) {
        screenshotPath = await uploadScreenshot(file);
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          mpesaRef: mpesaRef.trim(),
          amountKes: amountNum,
          recipientPhone: phone.trim(),
          screenshotPath,
        }),
      });

      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'This M-Pesa reference is already in use.');
        return;
      }
      if (!res.ok) {
        setError((await safeMessage(res)) ?? 'Payment failed');
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-5 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
        <TabButton active={mode === 'manual'} onClick={() => setMode('manual')}>
          Manual entry
        </TabButton>
        <TabButton active={mode === 'upload'} onClick={() => setMode('upload')}>
          Upload screenshot
        </TabButton>
      </div>

      <Field
        id="mpesa-ref"
        label="M-Pesa reference"
        value={mpesaRef}
        onChange={(v) => setMpesaRef(v.toUpperCase())}
        placeholder="e.g. QHX1234ABC"
        mono
        autoCapitalize="characters"
      />
      <Field
        id="amount"
        label="Amount (KES)"
        type="number"
        value={amount}
        onChange={setAmount}
        inputMode="decimal"
      />
      <Field
        id="phone"
        label="Recipient phone"
        value={phone}
        onChange={setPhone}
        type="tel"
        placeholder="+254 7XX XXX XXX"
      />

      {mode === 'upload' ? (
        <div className="space-y-2">
          <label htmlFor="screenshot" className="text-sm font-medium">
            Screenshot
          </label>
          <input
            id="screenshot"
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileChange}
            disabled={compressing || submitting}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
          />
          {compressing ? (
            <p className="text-xs text-muted-foreground">Compressing…</p>
          ) : compressedKb != null ? (
            <p className="text-xs text-muted-foreground">
              Compressed to {compressedKb} KB — ready to upload.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              JPEG/PNG/WebP, compressed to ≤ 500KB before upload.
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full"
        disabled={submitting || compressing}
      >
        {submitting ? 'Saving…' : 'Record payment'}
      </Button>
    </form>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-sm px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  mono,
  inputMode,
  autoCapitalize,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoCapitalize?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        className={cn(
          'h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring',
          mono && 'font-mono',
        )}
      />
    </div>
  );
}

async function safeMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}
