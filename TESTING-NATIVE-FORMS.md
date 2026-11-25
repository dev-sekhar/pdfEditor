# Native text and form filling acceptance checks

Run on `dev`:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npx playwright test tests/e2e/native-forms.spec.js
npm run test:e2e
npx tauri build --bundles nsis,msi
```

The existing Windows workflow also runs the complete browser suite and packages
both installer formats. The web workflow runs the new native/form browser tests.

Manual acceptance:

1. Open a simple selectable-text PDF using standard fonts. Enable Edit existing
   text, click a run, shorten its value, and apply. Verify same font, color and
   position. Try overflow and unsupported characters: the original must remain.
2. Zoom, rotate a page without forms, and edit again. Undo/Redo, save, close and
   reopen. Select/copy or search the changed text: only the replacement should
   occur in the rendered page. This feature is not secure redaction.
3. Open an AcroForm. Fill a text field, checkbox, radio and dropdown from the
   forms panel. Verify preview, save and reopen in a second PDF viewer. Field
   values and widgets must remain interactive. Check read-only rejection.
4. Open any printed table/form, including tests/fixtures/cms1500.pdf. Verify the
   diagnosis says there are no interactive fields. Click Fill form, click a
   blank space, type and Apply entry. Mark a checkbox using the X entry type,
   or create an interactive field, fill it, save and reopen. Scans have the same
   visual-fill path; no OCR is claimed.
5. Open XFA/hybrid and malformed-widget fixtures. Verify the explanation and
   blocked mutation. Do not treat a PDF that renders blank as successfully
   filled. Dynamic XFA rendering and execution are unsupported.

Also test tests/fixtures/embedded-layout.pdf: replace 'When Excel stops' with
'When Excel ends'. Verify that the original font and dark background remain.
Try a missing glyph and an overlong replacement: both must reject unchanged.

Optional local acceptance against supplied samples (never uploaded to CI):
set PDF_EDITOR_CAROUSEL and PDF_EDITOR_PRINTED_FORM to the local file paths,
then run `npx playwright test tests/e2e/local-samples.spec.js`.
PDF_EDITOR_LOCAL_OUTPUTS optionally stores synthetic edited copies locally.
Only synthetic/public documents belong in tests/fixtures.
