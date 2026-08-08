import type { ParsedAccount, Store, StoreEntry, Trade } from "../types"

const KEY = "fp-mtr-store"

const DEFAULT: Store = { version: 2, accounts: [] }

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT, accounts: [] }
    const parsed = JSON.parse(raw) as Store
    if (parsed.version !== DEFAULT.version || !Array.isArray(parsed.accounts)) {
      return { ...DEFAULT, accounts: [] }
    }
    return parsed
  } catch {
    return { ...DEFAULT, accounts: [] }
  }
}

function save(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function persistStore(store: Store): void {
  try {
    save(store)
  } catch (err) {
    console.error("localStorage save failed", err)
  }
}

// An uploaded file either replaces a known account (the file is the complete
// truth for that account) or is appended as a new one. Same-account files in
// one batch: the later file wins.
export function addParsed(store: Store, file: string, accounts: ParsedAccount[]): Store {
  const next: Store = { version: store.version, accounts: [...store.accounts] }
  for (const a of accounts) {
    const idx = next.accounts.findIndex((e) => e.accountId === a.accountId)
    const entry: StoreEntry = {
      accountId: a.accountId,
      name: a.accountId,
      file,
      uploadedAt: new Date().toISOString(),
      rows: a.rows,
      size: idx >= 0 ? next.accounts[idx].size : undefined,
    }
    if (idx >= 0) next.accounts[idx] = entry
    else next.accounts.push(entry)
  }
  next.accounts.sort((x, y) => x.accountId.localeCompare(y.accountId))
  save(next)
  return next
}

export function setAccountSize(store: Store, accountId: string, size: number): Store {
  const next: Store = {
    ...store,
    accounts: store.accounts.map((e) => (e.accountId === accountId ? { ...e, size } : e)),
  }
  save(next)
  return next
}

export function removeAccount(store: Store, accountId: string): Store {
  const next = { ...store, accounts: store.accounts.filter((e) => e.accountId !== accountId) }
  save(next)
  return next
}

export function clearAll(): Store {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  return { ...DEFAULT, accounts: [] }
}export function allTrades(store: Store): Trade[] {
  return store.accounts.flatMap((e) => e.rows)
}

export function accountName(store: Store, accountId: string): string {
  return store.accounts.find((e) => e.accountId === accountId)?.file ?? accountId
}