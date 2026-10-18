'use client';

import { useState } from 'react';
import { ApiError } from '@mdg/api-client';
import type { ApiErrorBody } from '@mdg/domain';
import { API_BASE_URL } from '@/lib/format';

export interface InquiryField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface InquiryFormProps {
  endpoint: string;
  submitLabel: string;
  successMessage: string;
  fields: InquiryField[];
  kind?: string;
  productId?: string;
}

export function InquiryForm({ endpoint, submitLabel, successMessage, fields, kind, productId }: InquiryFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...values };
      if (kind) body.kind = kind;
      if (productId) body.productId = productId;
      for (const field of fields) {
        if (field.type === 'number' && body[field.name]) body[field.name] = Number(body[field.name]);
      }
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => undefined)) as ApiErrorBody | undefined;
        throw new ApiError(res.status, data, 'We could not send your message.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not send your message. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card p-6">
        <p className="font-semibold text-success">Thank you</p>
        <p className="mt-2 text-sm text-charcoal-600">{successMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-6 sm:grid-cols-2">
      {fields.map((field) => (
        <label
          key={field.name}
          className={`flex flex-col gap-1 text-sm ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
        >
          <span className="font-medium text-charcoal-700">{field.label}{field.required ? ' *' : ''}</span>
          {field.type === 'textarea' ? (
            <textarea
              value={values[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
              required={field.required}
              placeholder={field.placeholder}
              className="min-h-24 rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2"
            />
          ) : field.type === 'select' ? (
            <select
              value={values[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
              required={field.required}
              className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2"
            >
              <option value="">Please choose…</option>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type ?? 'text'}
              value={values[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
              required={field.required}
              placeholder={field.placeholder}
              className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2"
            />
          )}
        </label>
      ))}
      {error ? (
        <p role="alert" className="sm:col-span-2 rounded-lg bg-danger-surface px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
          {busy ? 'Sending…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
