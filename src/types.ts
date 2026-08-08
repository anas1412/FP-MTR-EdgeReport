export type Trade = [account: string, time: string, pct: number | null, net: number]

export interface StoreEntry {
  accountId: string
  name: string
  file: string
  uploadedAt: string
  rows: Trade[]
  size?: number
}

export interface Store {
  version: number
  accounts: StoreEntry[]
}

export interface ParsedAccount {
  accountId: string
  rows: Trade[]
}

export interface ParsedFile {
  accounts: ParsedAccount[]
  missingPct: boolean
}

export type ParseResult =
  | { ok: true; data: ParsedFile; error: null }
  | { ok: false; data: null; error: string }

export interface AccountStat {
  accountId: string
  count: number
  net: number
  source: string
  uploadedAt: string
}

export type PerAccount = Record<string, AccountStat>