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

## Windows cloud build (dev)

Push to `dev` or open Actions > Build PDF Studio for Windows > Run workflow and select `dev`.
GitHub installs Node and Rust on a hosted Windows runner, runs the PDF tests, and builds both NSIS EXE and MSI installers. Local Rust installation is unnecessary.
Download the `PDF-Studio-Windows-<commit>` artifact from the successful run and unzip it. Install either format on Windows 11. These development installers are unsigned.

### Manual Windows acceptance check

Use copies of two non-sensitive PDFs with visibly different pages.

1. Open the first PDF and verify every page renders.
2. Open the second PDF and verify it appends to the first.
3. Delete a middle page and verify the page count and selection.
4. Rotate a page through four quarter turns; check the preview each time.
5. Move pages up and down, including at the first and last positions.
6. Export and reopen in another PDF reader; verify order, rotation, and deleted pages.
7. Extract a page and verify the exported document contains only that page.

Automated PDF tests check exported document structure; they do not establish that the installed WebView renders or downloads correctly. Record the tested commit and installer format when reporting results.
