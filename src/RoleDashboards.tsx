import type { RecordRow } from './core'

type SearchHistory = { query: string; metric: string; count: number; time: string }
type AdminProps = { records: RecordRow[]; datasetName: string; issues: string[]; history: SearchHistory[]; onImport: () => void; onExplore: () => void }
type SupportProps = { records: RecordRow[]; issues: string[]; onImport: () => void; onDownload: () => void }

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="min-w-0 border-l border-[var(--stroke)] pl-4 py-2 first:border-0 first:pl-0">
    <p className="m-0 text-xs text-[var(--muted)]">{label}</p>
    <p className="my-2 text-2xl font-semibold tracking-tight text-[var(--text)] tabular-nums">{value}</p>
    <p className="m-0 text-xs leading-5 text-[var(--quiet)]">{detail}</p>
  </div>
}

export function AdminDashboard({ records, datasetName, issues, history, onImport, onExplore }: AdminProps) {
  const dimension = records[0]?.embedding.length ?? 0
  const fieldCount = Object.keys(records[0]?.metadata ?? {}).length
  const meanNorm = records.length ? records.reduce((sum, row) => sum + row.norm, 0) / records.length : 0
  return <div className="role-view flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--stroke)] pb-5">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-[var(--quiet)]">Administration</p><h1 className="m-0 text-2xl font-semibold tracking-tight">Workspace overview</h1><p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">A factual snapshot of the current browser session and its imported vector data.</p></div>
      <button className="button primary min-h-11" onClick={onImport}>Import dataset</button>
    </header>
    <section aria-label="Dataset summary" className="grid grid-cols-2 gap-5 border-b border-[var(--stroke)] pb-6 lg:grid-cols-5">
      <Metric label="Records" value={records.length.toLocaleString()} detail={records.length ? 'Available for exact search' : 'No dataset loaded'} />
      <Metric label="Dimensions" value={dimension || '—'} detail="Original vector width" />
      <Metric label="Metadata fields" value={fieldCount} detail="Imported with each record" />
      <Metric label="Mean vector norm" value={records.length ? meanNorm.toFixed(3) : '—'} detail="Calculated from original vectors" />
      <Metric label="Import issues" value={issues.length} detail={issues.length ? 'Review before relying on this import' : 'No issues in the latest validation'} />
    </section>
    <section className="grid min-h-0 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
      <div className="min-w-0">
        <div className="mb-4 flex items-baseline justify-between gap-3"><div><h2 className="m-0 text-base font-semibold">Current dataset</h2><p className="mb-0 mt-1 text-xs text-[var(--muted)]">{datasetName}</p></div><button className="text-button" onClick={onExplore}>Open explorer</button></div>
        {records.length ? <div className="overflow-x-auto border-y border-[var(--stroke)]"><table className="w-full border-collapse text-left text-sm"><thead className="text-xs text-[var(--muted)]"><tr><th className="py-3 pr-4 font-medium">Record</th><th className="py-3 pr-4 font-medium">Content</th><th className="py-3 pr-4 font-medium">Group</th><th className="py-3 text-right font-medium">Norm</th></tr></thead><tbody>{records.slice(0,8).map((record) => <tr key={record.id} className="border-t border-[var(--stroke-soft)]"><td className="max-w-36 truncate py-3 pr-4 font-mono text-xs">{record.id}</td><td className="max-w-64 truncate py-3 pr-4 text-[var(--muted)]">{record.text || '—'}</td><td className="py-3 pr-4 text-[var(--muted)]">{record.metadata.category || '—'}</td><td className="py-3 text-right font-mono text-xs tabular-nums">{record.norm.toFixed(3)}</td></tr>)}</tbody></table>{records.length > 8 && <p className="m-0 border-t border-[var(--stroke-soft)] py-3 text-xs text-[var(--quiet)]">Showing 8 of {records.length.toLocaleString()} records. Open the explorer to filter and inspect the full dataset.</p>}</div> : <p className="border-y border-[var(--stroke)] py-8 text-sm text-[var(--muted)]">Import a CSV to see its real records and vector profile here.</p>}
      </div>
      <div className="min-w-0">
        <h2 className="mb-1 mt-0 text-base font-semibold">Session activity</h2><p className="mb-4 mt-0 text-xs text-[var(--muted)]">Searches and import validation from this tab only.</p>
        <div className="border-y border-[var(--stroke)]">{history.length ? history.slice(0,6).map((item,i) => <div key={`${item.time}-${i}`} className="flex items-center justify-between gap-3 border-b border-[var(--stroke-soft)] py-3 last:border-0"><div><strong className="block text-sm font-medium">Vector search</strong><span className="mt-1 block text-xs text-[var(--muted)]">{item.metric} · {item.count} matches · {item.time}</span></div><span aria-hidden="true" className="text-xs text-[var(--quiet)]">›</span></div>) : <p className="py-5 text-sm text-[var(--muted)]">No searches have been run in this session.</p>}</div>
        <p className="mt-4 text-xs leading-5 text-[var(--quiet)]">This page reports browser-session data only. It does not represent server uptime, team activity, or a connected production service.</p>
      </div>
    </section>
  </div>
}

export function SupportDashboard({ records, issues, onImport, onDownload }: SupportProps) {
  return <div className="role-view flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--stroke)] pb-5"><div><p className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-[var(--quiet)]">Support / data review</p><h1 className="m-0 text-2xl font-semibold tracking-tight">Import review queue</h1><p className="mb-0 mt-2 text-sm leading-6 text-[var(--muted)]">Review actionable validation issues from the latest CSV import.</p></div><button className="button secondary min-h-11" onClick={onImport}>Import another CSV</button></header>
    <section className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--stroke)] pb-5"><div><p className="m-0 text-xs text-[var(--muted)]">Current session</p><p className="mb-0 mt-2 text-lg font-semibold tabular-nums">{issues.length} review item{issues.length === 1 ? '' : 's'}</p></div><p className="m-0 text-xs text-[var(--quiet)]">{records.length.toLocaleString()} valid record{records.length === 1 ? '' : 's'} currently loaded</p>{issues.length > 0 && <button className="text-button" onClick={onDownload}>Download issue report</button>}</section>
    {issues.length ? <ol className="m-0 divide-y divide-[var(--stroke-soft)] border-y border-[var(--stroke)] p-0">{issues.map((issue,i) => <li key={`${issue}-${i}`} className="grid list-none grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 py-4"><span className="mt-0.5 font-mono text-xs tabular-nums text-[var(--quiet)]">{String(i+1).padStart(2,'0')}</span><p className="m-0 text-sm leading-6">{issue}</p><span className="rounded-sm border border-[var(--stroke)] px-2 py-1 text-[10px] text-[var(--muted)]">Needs review</span></li>)}</ol> : <div className="border-y border-[var(--stroke)] py-10"><h2 className="m-0 text-base font-semibold">No validation issues</h2><p className="mb-4 mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{records.length ? 'The most recent CSV validation did not produce any row issues.' : 'No CSV has been imported in this session yet.'}</p><button className="button secondary min-h-11" onClick={onImport}>{records.length ? 'Review another file' : 'Choose a CSV'}</button></div>}
    <p className="m-0 max-w-3xl text-xs leading-5 text-[var(--quiet)]">No external ticket stream is connected. This view uses only actual CSV validation findings; it does not create synthetic tickets or priorities.</p>
  </div>
}
