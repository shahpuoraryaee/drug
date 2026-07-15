# Arya Pharma Manager — optional vendor download (run once, needs internet)
# The app works 100% without these; they only add nicer dialogs (SweetAlert2),
# smoother charts (Chart.js) and the Bootstrap icon font.
# Usage: right-click > Run with PowerShell  (or:  powershell -ExecutionPolicy Bypass -File download-vendors.ps1)

$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "www\assets\vendor"

$files = @(
  @{ url = "https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"; out = "sweetalert2\sweetalert2.all.min.js" },
  @{ url = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js";               out = "chartjs\chart.umd.js" },
  @{ url = "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css"; out = "bootstrap-icons\bootstrap-icons.css" },
  @{ url = "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2"; out = "bootstrap-icons\fonts\bootstrap-icons.woff2" },
  @{ url = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";                out = "qrcodejs\qrcode.min.js" },
  @{ url = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";      out = "html5-qrcode\html5-qrcode.min.js" }
)

foreach ($f in $files) {
  $dest = Join-Path $root $f.out
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Write-Host "Downloading $($f.url)"
  Invoke-WebRequest -Uri $f.url -OutFile $dest
}
Write-Host "`nDone. Restart the app - the extras load automatically." -ForegroundColor Green
