import { useCallback, useRef, useState } from "react"
import type { Store, StoreEntry } from "../types"
import { parseCsv } from "../lib/csv"
import { addParsed } from "../lib/store"

export interface UploadViewProps {
  store: Store
  onStore: (s: Store) => void
  onViewReport: () => void
}

interface UploadMsg {
  kind: "ok" | "err"
  text: string
}

export function UploadView({ store, onStore, onViewReport }: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [msgs, setMsgs] = useState<UploadMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!files.length || busy) return
      setBusy(true)
      const out: UploadMsg[] = []
      let storeAcc: Store = store
      for (const file of Array.from(files)) {
        if (!/\.csv$/i.test(file.name) && file.type && file.type !== "text/csv") {
          out.push({ kind: "err", text: `${file.name}: not a CSV` })
          continue
        }
        try {
          const text = await file.text()
          const res = parseCsv(text, file.name)
          if (!res.ok) {
            out.push({ kind: "err", text: res.error })
            continue
          }
          let added = false
          for (const a of res.data.accounts) {
            if (storeAcc.accounts.some((e) => e.accountId === a.accountId)) {
              out.push({ kind: "ok", text: `${file.name}: updated ${a.accountId} (${a.rows.length} trades)` })
            } else {
              out.push({ kind: "ok", text: `${file.name}: added ${a.accountId} (${a.rows.length} trades)` })
            }
            added = true
          }
          if (!added) {
            out.push({ kind: "err", text: `${file.name}: no rows parsed` })
            continue
          }
          try {
            storeAcc = addParsed(storeAcc, file.name, res.data.accounts)
          } catch {
            out.push({ kind: "err", text: `${file.name}: browser storage is full — remove some accounts first` })
          }
        } catch (err) {
          out.push({ kind: "err", text: `${file.name}: ${(err as Error).message}` })
        }
      }
      setMsgs(out)
      onStore(storeAcc)
      setBusy(false)
    },
    [store, onStore, busy],
  )

  const remove = (id: string) => {
    onStore({
      ...store,
      accounts: store.accounts.filter((e) => e.accountId !== id),
    })
  }

  const clearAll = () => {
    onStore({ version: store.version, accounts: [] })
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString()

  return (
    <div className="wrap upload">
      <div className="eyebrow">FP-MTR · FundingPips</div>
      <h1>Edge Report</h1>
      <p className="lead">
        Upload your FundingPips MatchTrader CSV exports. Everything is analyzed and stored in
        your own browser — no account, no server, nothing leaves your machine.
      </p>

      <div
        className={`dropzone ${dragging ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload CSV files"
      >
        <div className="dz-title">Drop CSVs here</div>
        <div className="dz-sub">or click to choose files — multiple allowed, same account replaces, new accounts are added</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          handleFiles(e.target.files ?? [])
          e.target.value = ""
        }}
      />

      {msgs.length > 0 && (
        <div className="msg-list">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.kind}`}>{m.text}</div>
          ))}
        </div>
      )}

      {store.accounts.length > 0 && (
        <>
          <div className="acct-head">
            <h2>Saved accounts</h2>
            <button type="button" className="btn-logout" onClick={clearAll}>Remove all</button>
          </div>
          <table className="data accounts">
            <thead>
              <tr>
                <th>Account</th>
                <th>Trades</th>
                <th>Net P&amp;L</th>
                <th>File</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {store.accounts.map((e: StoreEntry) => {
                const net = e.rows.reduce((s, t) => s + t[3], 0)
                return (
                  <tr key={e.accountId}>
                    <td>{e.accountId}</td>
                    <td className="num">{e.rows.length}</td>
                    <td className={`num ${net < 0 ? "neg" : "pos"}`}>{net.toFixed(2)}</td>
                    <td className="num file-name" title={e.file}>{e.file}</td>
                    <td className="num">{fmtDate(e.uploadedAt)}</td>
                    <td className="num">
                      <button type="button" className="btn-x" onClick={() => remove(e.accountId)} aria-label={`Remove ${e.accountId}`}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="actions">
            <button type="button" className="login" onClick={onViewReport}>
              View report →
            </button>
          </div>
        </>
      )}

      {busy && <p className="note">Parsing files…</p>}
      <p className="note">
        Files stay in this browser only. Re-uploading the same account replaces its trades; new
        accounts are appended. Clearing browser data removes them.
      </p>
    </div>
  )
}