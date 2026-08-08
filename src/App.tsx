import { useState } from "react"
import type { Store } from "./types"
import { loadStore, persistStore } from "./lib/store"
import { UploadView } from "./components/UploadView"
import { ReportView } from "./components/ReportView"
import { downloadReportHtml } from "./exportHtml"

export default function App() {
  const [store, setStore] = useState<Store>(() => loadStore())
  const [view, setView] = useState<"upload" | "report">(
    () => (loadStore().accounts.length ? "report" : "upload"),
  )

  const updateStore = (s: Store) => {
    setStore(s)
    persistStore(s)
  }

  const onExport = () => {
    try {
      downloadReportHtml(store)
    } catch (err) {
      alert("Export failed: " + (err as Error).message)
    }
  }

  if (view === "upload") {
    return <UploadView store={store} onStore={updateStore} onViewReport={() => setView("report")} />
  }
  return <ReportView store={store} onManage={() => setView("upload")} onExport={onExport} onStore={updateStore} />
}