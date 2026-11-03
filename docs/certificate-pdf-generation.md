# Certificate PDF generation

Library: **PDFKit** + **qrcode**

## Process
1. Allocate certificate number + verification code
2. Build public verification URL from `PUBLIC_API_BASE_URL` (or localhost fallback)
3. Render QR PNG to temp dir
4. Render PDF with template snapshot fields
5. SHA-256 checksum
6. Copy to `{UPLOAD_ROOT}/certificates/{yyyy-mm-dd}/`
7. Delete temp files
8. Persist Certificate only after PDF exists

## Snapshot immutability
`templateSnapshot` is copied at issue time. Later template edits do not change issued PDFs (regenerate uses the snapshot).

## Security
- No arbitrary HTML execution (PDFKit drawing API only)
- Paths validated via `resolveInsideRoot`
- Downloads authenticated; public verify never returns storage paths
