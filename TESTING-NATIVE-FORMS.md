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
   diagnosis says there are no interactive fields. Add text in blank spaces,
   or create an interactive field, fill it, save and reopen. Scans have the same
   visual-fill path; no OCR is claimed.
5. Open XFA/hybrid and malformed-widget fixtures. Verify the explanation and
   blocked mutation. Do not treat a PDF that renders blank as successfully
   filled. Dynamic XFA rendering and execution are unsupported.

No user document was supplied; there is no diagnosis of any particular form.
The public CMS fixture is one generic printed-layout example.

Status before handoff: 97 unit tests and production web build passed. Local
browser execution was not completed; the user elected to run tests. Changes
made during final review still require the acceptance run. Windows packaging
must be confirmed against the resulting GitHub Actions run, not inferred from
the web build.
