import { PDFArray, PDFDict, PDFName } from 'pdf-lib';

// Inspect the catalog before getForm(): pdf-lib deliberately deletes XFA there.
export function formDiagnostics(doc) {
  const acro = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  const xfa = Boolean(acro?.has(PDFName.of('XFA')));
  const roots = acro?.lookupMaybe(PDFName.of('Fields'), PDFArray);
  const seen = new Set();
  let signed = false;
  function visit(entry) {
    const dict = doc.context.lookup(entry);
    if (!(dict instanceof PDFDict) || seen.has(dict)) return;
    seen.add(dict);
    if (dict.lookup(PDFName.of('FT'))?.toString() === '/Sig') signed = true;
    const kids = dict.lookupMaybe(PDFName.of('Kids'), PDFArray);
    kids?.asArray().forEach(visit);
  }
  roots?.asArray().forEach(visit);
  let orphanWidgets = 0;
  for (const page of doc.getPages()) {
    for (const entry of page.node.Annots()?.asArray() ?? []) {
      const dict = doc.context.lookup(entry);
      if (dict instanceof PDFDict && dict.lookup(PDFName.of('Subtype'))?.toString() === '/Widget' && !seen.has(dict)) orphanWidgets++;
    }
  }
  const fields = roots?.size() ?? 0;
  return { xfa, signed, orphanWidgets, fields, protected: xfa || signed || orphanWidgets > 0,
    type: xfa ? 'XFA' : fields ? 'AcroForm' : orphanWidgets ? 'Unattached widgets' : 'Noninteractive',
    message: xfa ? 'XFA form detected. Filling is unsupported; open it in an XFA-capable viewer. XFA data is preserved.' :
      signed ? 'Signature fields detected. Form and native text editing are blocked; signature validation is unavailable.' :
      orphanWidgets ? 'Unattached form widgets detected. Automatic repair is unsafe; editing is blocked.' :
      fields ? 'AcroForm detected. Choose a field below to fill it; changes remain interactive.' :
      'No interactive fields found. This may be a printed or scanned form. Use Add text to fill visually, or Create field to make it interactive; no OCR is performed.' };
}

export function requireEditableForm(doc) {
  const info = formDiagnostics(doc);
  if (info.protected) throw new Error(info.message);
  return info;
}
