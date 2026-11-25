# PDF Studio v0.8

Local-first hybrid PDF editor. React + PDF.js viewer + pdf-lib editing engine, with Tauri 2 desktop wrapper.

## Interactive PDF forms (development branch)

PDF Studio now includes a **PDF forms** panel. Choose an existing field to fill text, checkboxes, radio choices, dropdowns, or list selections and apply the change. You can edit simple field names, required flags, single-widget positions and sizes, and dropdown/list choices. Select **Create field** to add text, checkbox, radio, dropdown, or list fields, specifying a field name and PDF-point rectangle (origin at the bottom-left).

All operations modify real AcroForm dictionaries, and fields stay interactive when saved and reopened. Undo/redo stores the previous PDF bytes. This is not an XFA editor or a full Acrobat form designer: nested-field renaming, JavaScript validation, form calculations, page labels printed in content, radio option editing, and multi-widget geometry changes are not supported.

**Document-safety restriction:** PDF page copying can detach AcroForm widgets from their fields. Until that operation is implemented in a form-aware manner, PDF Studio refuses merge, extract, delete, and rearrange operations involving form PDFs when they would alter the original page sequence, instead of silently stripping fields. To rearrange such a PDF, first create and retain a separate flattened copy in a capable PDF tool. Form fields are preserved when the original page sequence is left intact. Secure redaction deliberately rasterizes and removes all forms.

Forms are tested using synthetic editable PDFs. Test real third-party forms, non-Latin field values, and Windows-native rendering before relying on this build for important documents.

## Run web
Node 22+: `npm install`, `npm test`, `npm run dev`.

## Build Windows desktop
Install Rust, Microsoft C++ Build Tools and WebView2 prerequisites per Tauri 2 documentation. Run `npm run desktop:dev` or `npx tauri build` on Windows.

## Implemented
Open and merge PDFs with visual page selection, reorder/rotate/delete/extract pages, zoom, undo/redo, save with safeguards, select PDF text, highlight/underline text, add comments, and place/style/move text overlays. Edit annotation content or colors and export PDFs. All processing runs locally in the webview.

## Roadmap (not yet implemented)
True editing of existing PDF text and images; split by range; password encryption and permissions; irreversible redaction (planned for 0.9); OCR; PDF/A; forms; certificate signatures; document compare; Office conversion; batch processing; accessibility tagging; Bates numbering; secure cloud sync. No Acrobat Pro parity claim yet.

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
## Text overlay styles

Choose Helvetica, Times, or Courier, a size from 6–144 points, and a text color before placing an overlay. The sidebar shows a live style sample. Select a text handle or use Style target to style an existing overlay, then click Apply text style; this is one undoable change and preserves its position. New text defaults are separate from selected-overlay styles. Standard PDF fonts support Latin characters; unsupported glyphs report an error instead of silently disappearing on export.

## Annotation editing

Use Edit annotations to select an annotation on the current page. Edit text overlay or comment content, change a highlight or underline color, or delete any annotation. Apply creates one undoable change and keeps its identity and position; Undo and Redo also restore deleted annotations.

PDF Studio comments, highlights, and underlines remain editable after saving and reopening. Other imported annotations are preserved when saving. Text overlays are editable only in the current session: exported overlays become PDF page content on reopening. This feature does not edit existing PDF text.

## Reopening Studio annotations

Saved PDF Studio comments, highlights and underlines reopen as editable page metadata, including Unicode notes, page markers and markup lists. Incoming selected pages retain their own annotations when merged. Studio-owned supported annotations are removed from the stored source and exported once from their metadata; unrelated and unsupported native annotations remain in the source. This import support identifies Studio ownership using the native author marker and stable annotation ID.

## Secure redaction (0.9)

Mark areas by dragging on a page, review the red hatched **PENDING** areas, then choose **Apply secure redaction**. Pending areas are not redacted yet: saving and extracting are blocked until you apply or clear them. Page navigation and zoom remain available while marking.

Version 0.9 deliberately creates a fresh **image-only PDF of every page**, rendered locally at 216 DPI. Marked pixels are overwritten with opaque black in the rendered image before lossless PNG encoding. A new document contains only these page images; source PDF objects, selectable/OCR text, editable annotations, forms, links, attachments, optional layers, and original metadata are not copied. Visible content outside the areas is rasterized too. This can increase file size and reduce sharpness at high zoom; exported pages are no longer searchable or accessible as text. Visible information outside your selected areas remains visible, so review the entire result before sharing.

Apply is an explicit irreversible step in the editor: success replaces the sources and clears Undo/Redo history and the previous save destination. The filename defaults to `*-redacted.pdf`; save a separate copy. Your original file on disk, previous downloads, backups, and copies are not erased. This feature removes selected content from the newly generated PDF; it does not promise secure erasure of files or computer memory.

Cancelling confirmation or processing leaves the document and pending marks intact. Load, render, image encoding, validation, or resource-limit failures also leave the document intact. Every page is checked before rendering, and generated output is structurally verified to contain only opaque page images with no text fonts, annotations, forms, or attached documents. Redaction supports up to 200 pages, 100 MiB of input, 16 million pixels per page and 128 million pixels across the document, at 216 DPI. Exceeding a limit reports an error rather than producing a partial or lower-resolution file.

Desktop acceptance: apply to a copy containing visible text and scanned text; save, close and reopen the result in another reader. Check every marked area, copying/searching text, rotated/cropped pages, and image extraction. Verify native Save As suggests the redacted filename and does not reuse the previously saved path. Check cancellation, errors, and closing while processing keep the original editor document intact.

## Export to Word (0.10)

Choose **Export to Word** and select **Editable text** or **Page images**, then save the separate `.docx` file. Conversion runs locally with no upload or installed Microsoft Word requirement. The PDF, its native save path, saved/unsaved state and Undo/Redo history stay unchanged. Native Word export always uses a new Save As dialog and requires a `.docx` filename.

Editable text extracts selectable PDF text into paragraphs in a simple visual reading order. It does not reconstruct tables, columns, image placement, annotations, or exact formatting. Some text layers contain OCR or partially visible text; this mode follows the PDF text layer rather than guaranteeing a visual transcription. Pages without extractable text are included as page images instead of being silently omitted. No OCR is performed.

Page images renders each current page at 144 DPI and embeds it as a picture in Word. It preserves the visible crop, rotation and aspect ratio, but the text is not editable. Oversized pages are scaled uniformly to Word's 22-inch page limit. This mode is useful for scans and the image-only PDFs produced by secure redaction.

Export uses only the current PDF bytes, including current page edits and applied redactions. Pending redactions must be applied or cleared first. It never reads the original pre-redaction source or restores discarded history. Cancellation or conversion errors leave the PDF intact. Cancellation is available during conversion; the native Save As dialog supplies cancellation after saving starts. Once writing has started, the app does not claim that it can cancel that write.

The cloud workflow additionally renders synthetic DOCX export samples in LibreOffice and verifies pagination, with page PNGs retained for visual QA. This complements the DOCX XML/image checks and Windows browser/native build checks. Conversion supports up to 200 pages, 100 MiB of PDF input, 2 million extracted characters, 16 million pixels per rendered page and 128 million rendered pixels in total; failures do not produce a partial export.
# Native text editing and claims-form diagnostics (dev milestone)

## Interactive form filling in 0.12

Choose **Fill form**. Existing supported fields are highlighted and accept direct
typing, checkbox clicks and Tab navigation on the selected page. No per-field
Apply box is required. Edits remain pending until **Save PDF**, which writes the
values and appearance streams while keeping the form interactive. Pending edits
participate in Undo/Redo, unsaved-change protection and Word export.

On a printed vector form, **Fill form** recognizes likely blank boxes, character
boxes, table cells and ruled blanks on the current page. Review the highlighted
proposals, click any unwanted proposal to exclude it, then choose **Create
interactive fields**. Recognition does not silently change the PDF. Repeated
recognition excludes existing fields. Navigate to another page to prepare it.

Detection is heuristic, using vector geometry and rendered blankness. It does
not OCR scanned pages or outlined labels, assign semantic names, infer Yes/No
radio groups, run calculations, or provide signatures or XFA support. Review is
necessary; missed areas can still be added using Create field. **Free text fill**
retains the earlier overlay workflow and is labeled separately.

Use **Edit existing text**, click a supported text run on the page, change its
value and apply. The PDF text-show instruction is replaced; there is no white
rectangle or replacement overlay. Undo/Redo and Save retain the change.
This is a conservative first native-content milestone, not Acrobat parity.

Supported: horizontal single-show runs in standard Latin fonts and simple
embedded TrueType subsets with one-byte bfchar maps and explicit glyph widths.
Replacements reuse the original font, glyph encoding, size, color and position,
and must fit the original width. Surrounding vector graphics and XObjects are
preserved. Unsupported runs are not exposed as editable; unknown content syntax
blocks editing conservatively. No paragraph reflow, font substitution, OCR,
kerning arrays, composite/CID font editing, arbitrary rotated text or clipping.
Embedded subsets support only their existing mapped glyphs. Existing
Add text remains explicitly an overlay. Text replacement is **not redaction**:
unreferenced original objects may remain in the saved file; use secure redaction
for sensitive information.

The PDF forms panel diagnoses the catalog before accessing form APIs:

| Document | Behavior |
| --- | --- |
| AcroForm | Fill supported text, checkbox, radio and choice fields; preserve widgets and the field tree |
| XFA, including hybrid | Preserve the XFA packet; block form/native-text edits and page copying; explain viewer requirement |
| Printed/scanned/noninteractive | Use Fill form to click and type in blank spaces or mark a checkbox with X; optionally Create field; no OCR |
| Unattached widgets | Block automatic repair and explain the ambiguity |
| Signature fields | Block form/native-text edits; no signature validation is claimed |
| Read-only fields | Show status and reject mutation |

Only the changed field's appearance is regenerated. Untouched custom/embedded
font appearances are preserved. The changed field currently uses Helvetica:
unsupported Unicode raises an error and commits no change. JavaScript actions,
calculations, XFA execution, and full field-formatting fidelity are unsupported.
Supported field values can be edited directly on the page or from the forms
panel. Unsupported widget types retain their normal preview. Page copying/reordering/rotation
with forms remains blocked to prevent field loss.

**Free text fill** works on printed tables and outlined/scanned layouts without
requiring original fields. Select Text or Mark checkbox (X), choose a size,
click a blank space, type, and Apply entry. Click an entry's Edit button to
revise it during the session. Undo/Redo and Save preserve the visible entries.
These are text overlays; saving does not turn them into AcroForm fields.
Use Create field when the saved document needs interactive inputs.

Local sample tests reproduced both reported cases: a noninteractive printed
questionnaire and a carousel using embedded TrueType subsets over graphics.
Neither user document is checked in or uploaded to CI. Set PDF_EDITOR_CAROUSEL
and PDF_EDITOR_PRINTED_FORM to local paths to run tests/e2e/local-samples.spec.js.
Reusable CI fixtures are synthetic or public; see tests/fixtures/README.md.
