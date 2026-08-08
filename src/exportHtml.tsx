import { renderToString } from "react-dom/server.browser"
import type { Store } from "./types"
import { ReportView } from "./components/ReportView"
import cssText from "./styles.css?inline"

// Standalone HTML report: same components, rendered server-side to a static
// string, CSS inlined, appbar hidden. No backend involved — the whole report
// is already client-computed at export time.
export function downloadReportHtml(store: Store) {
  const html = renderToString(
    <ReportView store={store} onManage={() => {}} onExport={() => {}} onStore={() => {}} />,
  )
  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Edge Report — ${new Date().toISOString().slice(0, 10)}</title>
<style>
  ${cssText}
  .appbar, .tzhint { display: none !important; }
</style>
</head>
<body>
${html}
</body>
</html>`
  const blob = new Blob([doc], { type: "text/html" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "edge-report-" + new Date().toISOString().slice(0, 10) + ".html"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}