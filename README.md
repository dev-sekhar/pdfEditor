# PDF Studio v0.5

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

## Zoom, drag reordering, Save As, and release notes (v0.3)

Use the Zoom controls to choose 25–300%, Fit width, or Fit page. Fit modes respond to window resizing. Zoom is a viewing preference and does not alter the exported PDF or add history steps.

Drag a page thumbnail onto the upper or lower half of another thumbnail. A blue line marks the insertion point. The moved page stays selected, and the change supports Undo/Redo. The Move buttons remain available for keyboard use. Import files through Open / merge.

Save As opens the native Windows dialog to choose the filename and location, including for Extract. Cancel leaves the document intact. Saving reports success only after the file write completes; errors appear in the editor. Outside Tauri, the same button uses a browser download. Native file access is limited to paths selected by the save dialog.

What’s new appears once after each version update and can be reopened from the footer. Dismissal is remembered locally on this device. Release notes contain short feature bullets.

### Release procedure

For every release, update the version in package.json, package-lock.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json. Add the new version’s concise feature bullets to src/releases.js. A unit test fails if the current version has no release notes. Keep all development on dev and require the Windows installer workflow to pass.

### Desktop checks for v0.3

1. Confirm the release pop-up appears on the first launch, stays dismissed after relaunch, and reopens via What’s new.
2. Try zoom percentages and fit modes, resize the window, and rotate a page while fitted.
3. Drag pages up/down with the blue insertion marker; verify Undo/Redo and exported order.
4. Use Save As to choose a new filename and folder. Reopen the PDF in another reader.
5. Cancel Save As; verify there is no success message or new file and the editor is still usable.
6. Test overwriting an existing PDF with the native confirmation, and test extracting a single page through Save As.

Browser tests and mocked Save As unit tests cover app behavior, cancellation, and write errors. The native dialog’s appearance, overwrite confirmation, and chosen-path access still require desktop acceptance checks.

## Merge insertion choices (v0.4)

With a document open, choose Open / merge and select additional PDFs. The Insert PDF pages dialog offers before/after the selected page, beginning, end, or a specific page number. Specific numbers mean insert before that existing page; N+1 inserts at the end of an N-page document. The default is End of document.

All pages from the chosen files are inserted together in selected file order. The first inserted page becomes selected. The complete merge is one Undo/Redo step. Cancel and invalid imports leave the document and history unchanged. Opening files into an empty editor does not require choosing a position.

## Incoming page ranges (v0.5)

When merging into an open document, each incoming PDF has a page-selection field and its page count. Leave the field blank (or enter all) to include every page, or use one-based numbers and ascending ranges such as 1, 3-5, 8. Pages follow the order entered; duplicates are included once. Selections are independent for each file, and files retain their selected order.

Invalid, reversed, or out-of-bounds ranges keep the dialog open without changing the current document. Correct the range or Cancel. Selected pages retain the existing insertion options and are one Undo/Redo step. Corrupt/password-protected PDFs report an import error before merging. Cancel while reading files leaves the current document unchanged.

The merge dialog shows thumbnails of the selected pages in insertion order, labeled with original page numbers and source filenames. Click a thumbnail to inspect a larger preview. Previews update when ranges change; invalid ranges hide the selected-page preview. The summary states where selected pages will be inserted and the resulting document page count. No pages are inserted until you confirm.

## Visual incoming page selection

Incoming PDFs show checkboxes on every page thumbnail. Use Select all or Clear selection for each PDF, or enter ranges such as `1, 3-5`. The range field and checkboxes stay synchronized. Blank means all pages; `none` explicitly excludes that PDF. At least one incoming page must be selected before insertion.

Selected-page previews show the exact merge order. Pages checked later are appended to that order, and you can inspect a larger preview before inserting. Verify the exported document and undo the merge to check the original remains recoverable.
### Native close acceptance check

The Windows close handler is covered with injected API tests; these do not operate a real window. On Windows, verify that a clean document closes normally, unsaved changes show Save/Discard/Cancel, cancelling Save As or a failed write keeps the app open, and closing during an operation does not discard the document. A second close request must preserve any existing unsaved-changes prompt. Save and Discard close only after their guarded continuation; a native close failure is shown in the editor.

## Reopening Studio annotations

Saved PDF Studio comments, highlights and underlines reopen as editable page metadata, including Unicode notes, page markers and markup lists. Incoming selected pages retain their own annotations when merged. Studio-owned supported annotations are removed from the stored source and exported once from their metadata; unrelated and unsupported native annotations remain in the source. This import support identifies Studio ownership using the native author marker and stable annotation ID.
