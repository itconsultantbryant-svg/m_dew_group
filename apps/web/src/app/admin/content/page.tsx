'use client';

import { useState } from 'react';
import { formatMoney } from '@mdg/domain';
import { LiveBar, Panel, EmptyState } from '@/components/admin/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface Block { id: string; key: string; title: string | null; body: string | null; status: string }
interface MenuItem { id: string; name: string; description: string; priceMinor: number; isAvailable: boolean; soldOut: boolean }
interface Category { id: string; name: string; isPublished: boolean; items: MenuItem[] }
interface Product { id: string; name: string; description: string; priceMinor: number; isPublished: boolean }
interface Collection { id: string; name: string; isPublished: boolean; products: Product[] }
interface Event { id: string; title: string; description: string; startsAt: string; isPublished: boolean }

interface Catalog {
  blocks: Block[];
  faqs: unknown[];
  menuCategories: Category[];
  collections: Collection[];
  events: Event[];
}

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export default function AdminContentPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const live = useLive<Catalog>(() => staffRequest('/staff/content/catalog'), 15000);
  const data = live.data;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={error ?? live.error} />

      {!data ? (
        <p className="text-charcoal-600">{live.loading ? 'Loading content…' : 'No content.'}</p>
      ) : (
        <>
          <Panel title="Content blocks" subtitle="Homepage and marketing sections">
            <div className="space-y-4">
              {data.blocks.length === 0 ? <EmptyState>No content blocks yet.</EmptyState> : null}
              {data.blocks.map((block) => (
                <BlockEditor key={block.id} block={block} busy={busy} onSave={(payload) => void run(() => staffRequest(`/staff/content/${encodeURIComponent(block.key)}`, { method: 'PUT', body: payload }))} />
              ))}
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Restaurant menu" subtitle="Mark items sold out or unavailable">
              {data.menuCategories.length === 0 ? <EmptyState>No menu categories.</EmptyState> : null}
              <div className="space-y-5">
                {data.menuCategories.map((cat) => (
                  <div key={cat.id}>
                    <p className="text-sm font-semibold text-charcoal-800">{cat.name} <span className="ml-2 text-xs font-normal text-charcoal-500">{cat.isPublished ? 'published' : 'hidden'}</span></p>
                    <ul className="mt-2 divide-y divide-forest-900/10">
                      {cat.items.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div>
                            <p className="font-medium text-charcoal-800">{item.name}</p>
                            <p className="text-xs text-charcoal-500">{formatMoney({ amountMinor: item.priceMinor, currency: 'USD' })}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Toggle
                              label="Sold out"
                              active={item.soldOut}
                              disabled={busy}
                              onChange={(value) => void run(() => staffRequest(`/staff/menu/items/${item.id}`, { method: 'PUT', body: { soldOut: value } }))}
                            />
                            <Toggle
                              label="Available"
                              active={item.isAvailable}
                              disabled={busy}
                              onChange={(value) => void run(() => staffRequest(`/staff/menu/items/${item.id}`, { method: 'PUT', body: { isAvailable: value } }))}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Boutique products" subtitle="Publish or hide catalogue items">
              {data.collections.length === 0 ? <EmptyState>No collections.</EmptyState> : null}
              <div className="space-y-5">
                {data.collections.map((collection) => (
                  <div key={collection.id}>
                    <p className="text-sm font-semibold text-charcoal-800">{collection.name}</p>
                    <ul className="mt-2 divide-y divide-forest-900/10">
                      {collection.products.map((product) => (
                        <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div>
                            <p className="font-medium text-charcoal-800">{product.name}</p>
                            <p className="text-xs text-charcoal-500">{formatMoney({ amountMinor: product.priceMinor, currency: 'USD' })}</p>
                          </div>
                          <Toggle
                            label={product.isPublished ? 'Published' : 'Hidden'}
                            active={product.isPublished}
                            disabled={busy}
                            onChange={(value) => void run(() => staffRequest(`/staff/boutique/products/${product.id}`, { method: 'PUT', body: { isPublished: value } }))}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Experiences & events" subtitle="Publish or hide upcoming events">
            {data.events.length === 0 ? (
              <EmptyState>No events.</EmptyState>
            ) : (
              <ul className="divide-y divide-forest-900/10 text-sm">
                {data.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="font-medium text-charcoal-800">{event.title}</p>
                      <p className="text-xs text-charcoal-500">{new Date(event.startsAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge label={event.isPublished ? 'Published' : 'Hidden'} tone={event.isPublished ? 'success' : 'neutral'} />
                      <Toggle
                        label={event.isPublished ? 'Unpublish' : 'Publish'}
                        active={event.isPublished}
                        disabled={busy}
                        onChange={(value) => void run(() => staffRequest(`/staff/experiences/events/${event.id}`, { method: 'PUT', body: { isPublished: value } }))}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Toggle({ label, active, disabled, onChange }: { label: string; active: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${active ? 'bg-success-surface text-success' : 'bg-charcoal-800/5 text-charcoal-600'}`}
    >
      {label}
    </button>
  );
}

function BlockEditor({ block, busy, onSave }: { block: Block; busy: boolean; onSave: (payload: { title: string; body: string; status: string }) => void }) {
  const [title, setTitle] = useState(block.title ?? '');
  const [body, setBody] = useState(block.body ?? '');
  const [status, setStatus] = useState(block.status);

  return (
    <div className="rounded-lg border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-charcoal-500">{block.key}</p>
        <StatusBadge label={status === 'PUBLISHED' ? 'Published' : status === 'ARCHIVED' ? 'Archived' : 'Draft'} tone={status === 'PUBLISHED' ? 'success' : 'neutral'} />
      </div>
      <div className="mt-3 grid gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5 text-xs">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => onSave({ title, body, status })} className="rounded-md bg-forest-900 px-4 py-1.5 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
          Save block
        </button>
      </div>
    </div>
  );
}
