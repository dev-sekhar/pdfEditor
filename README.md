# PDF Studio v0.2

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

## Undo/redo and thumbnails (v0.2)

The Pages sidebar shows previews of edited pages. Click a thumbnail to select a page; previews reflect page rotation and text overlays and load as you scroll.

Undo reverses the last document change; Redo restores an undone change. The toolbar shows the available action in its tooltip. Use Ctrl+Z to undo and Ctrl+Y or Ctrl+Shift+Z to redo. While typing in a text field, these shortcuts retain the field's normal text undo behavior.

Open/merge, page moves, rotations, deletions, and applied text overlays are undoable. Page selection and exports do not add undo steps. Making a new edit after undo clears redo. History keeps up to 30 document changes in memory and resets when the app closes. Large PDFs and text overlays can consume additional memory.

### Feature checks

1. Import a PDF and verify the sidebar shows recognizable page previews.
2. Rotate a page, then Undo and Redo; confirm both the large preview and thumbnail follow the change.
3. Delete a page, including the last remaining page, and Undo to restore it.
4. Merge a second PDF; Undo removes its pages and Redo restores them.
5. Add text; Undo removes the overlay and Redo restores it.
6. Undo a change, then make a different edit; verify Redo becomes disabled.
7. Export after undo/redo and reopen the PDF in another reader to confirm its final state.

Run `npm test` for PDF/history tests. Run `npm run test:e2e` for real browser import/edit/preview/export checks (requires Playwright Chromium); alternatively set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge browser. The Windows cloud workflow installs its test browser on the hosted runner before building installers.
