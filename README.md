# PDF Studio v0.1

Local-first hybrid PDF editor. React + PDF.js viewer + pdf-lib editing engine, with Tauri 2 desktop wrapper.

## Run web
Node 22+: `npm install`, `npm test`, `npm run dev`.

## Build Windows desktop
Install Rust, Microsoft C++ Build Tools and WebView2 prerequisites per Tauri 2 documentation. Run `npm run desktop:dev` or `npx tauri build` on Windows.

## Implemented
Open multiple PDFs, merge, reorder, rotate, delete, extract pages, overlay simple text, export PDF. All processing runs locally in the webview.

## Roadmap (not yet implemented)
True editing of existing PDF text and images; interactive positioning; undo/redo; split by range; password encryption and permissions; irreversible redaction; OCR; PDF/A; forms; certificate signatures; document compare; Office conversion; batch processing; accessibility tagging; Bates numbering; secure cloud sync. No Acrobat Pro parity claim yet.

## Security notes
Password restrictions are not equivalent to cryptographic access control. Never represent a visual black rectangle as secure redaction. Do not upload documents to a remote service without explicit user consent. Validate untrusted PDFs and dependencies before production release.
