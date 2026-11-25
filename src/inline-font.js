import { PDFArray, PDFName, PDFRawStream, PDFString, PDFHexString, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { byteString } from './content-tokens';
export function stringBytes(raw) {
  if(raw.startsWith('(')) return PDFString.of(raw.slice(1,-1)).asBytes();
  if(/^<[\da-fA-F\s]*>$/.test(raw)) return PDFHexString.of(raw.slice(1,-1)).asBytes();
  throw new Error('Unsupported PDF text operand.');
}
export async function inlineFont(doc,dict) {
  const base=dict.lookup(PDFName.of('BaseFont'))?.toString().slice(1), subtype=dict.lookup(PDFName.of('Subtype'))?.toString(), encoding=dict.lookup(PDFName.of('Encoding'))?.toString();
  if(subtype==='/Type1'&&Object.values(StandardFonts).includes(base)&&!/Symbol|Zapf/.test(base)&&!['ToUnicode','FontDescriptor','Widths'].some(key=>dict.has(PDFName.of(key)))&&(!encoding||encoding==='/WinAnsiEncoding')) {
    const font=await doc.embedFont(base);
    return {base,decode:bytes=>{ if(Array.from(bytes).some(c=>c<32||c>126)) throw new Error('Unsupported standard-font encoding.'); return byteString(bytes); },
      encode:value=>{ if(/[^\x20-\x7e]/.test(value)) throw new Error('This font supports printable basic Latin replacements only.'); return font.encodeText(value).asBytes(); },width:value=>Array.from(value,ch=>font.widthOfTextAtSize(ch,1)).reduce((a,b)=>a+b,0)};
  }
  // Reuse a one-byte TrueType subset's existing glyphs and original metrics.
  if(subtype!=='/TrueType') throw new Error('Unsupported font type.');
  const cmap=dict.lookup(PDFName.of('ToUnicode')), widths=dict.lookupMaybe(PDFName.of('Widths'),PDFArray), first=dict.lookup(PDFName.of('FirstChar'))?.asNumber?.();
  if(!(cmap instanceof PDFRawStream)||!widths||!Number.isInteger(first)) throw new Error('Missing subset encoding or metrics.');
  const source=byteString(decodePDFRawStream(cmap).decode());
  if(/beginbfrange|usecmap/.test(source)) throw new Error('Unsupported subset character map.');
  const ranges=[...source.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)];
  if(ranges.length!==1||!/^\s*<[\da-f]{2}>\s*<[\da-f]{2}>\s*$/i.test(ranges[0][1])) throw new Error('Unsupported subset code width.');
  const decode=new Map(), encode=new Map();
  for(const block of source.matchAll(/(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g)) {
    const entries=[...block[2].matchAll(/<([\da-f]{2})>\s*<([\da-f]{4})>/gi)];
    if(entries.length!==Number(block[1])) throw new Error('Incomplete subset character map.');
    for(const [,code,unicode] of entries) {
      const id=parseInt(code,16),ch=String.fromCharCode(parseInt(unicode,16));
      if(decode.has(id)) throw new Error('Ambiguous subset character map.'); decode.set(id,ch);
      if(ch>=' '&&!/[\x7f-\x9f\ud800-\udfff]/.test(ch)) {
        if(encode.has(ch)) throw new Error('Ambiguous subset glyph encoding.');
        encode.set(ch,id);
      }
    }
  }
  if(!decode.size) throw new Error('Empty subset character map.');
  const toBytes=value=>Uint8Array.from(Array.from(value,ch=>{ if(!encode.has(ch)) throw new Error(`The embedded font does not contain “${ch}”. Use its existing glyphs; font substitution is unavailable.`); return encode.get(ch); }));
  return {base,decode:bytes=>Array.from(bytes,id=>{ const ch=decode.get(id); if(!ch||ch<' '||/[\x7f-\x9f\ud800-\udfff]/.test(ch)) throw new Error('Unmapped subset glyph.'); return ch; }).join(''),encode:toBytes,
    width:value=>Array.from(toBytes(value),id=>{ const width=widths.lookup(id-first)?.asNumber?.(); if(!Number.isFinite(width)||width<0) throw new Error('Missing glyph width.'); return width/1000; }).reduce((a,b)=>a+b,0)};
}
