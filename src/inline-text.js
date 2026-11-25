import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { requireEditableForm } from './form-diagnostics';
import { contentTokens, byteString } from './content-tokens';
import { inlineFont, stringBytes } from './inline-font';

const unsupported=()=>{ throw new Error('No safely editable text runs found. Complex text, clipping, composite fonts and outlined lettering are unsupported. Use Fill & sign to add text in blank spaces.'); };
const identity=()=>[1,0,0,1,0,0];
function multiply(a,b) { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; }
const horizontal=m=>m[0]>0&&m[3]>0&&m[1]===0&&m[2]===0;
const graphics={m:2,l:2,c:6,v:4,y:4,h:0,re:4,n:0,S:0,s:0,f:0,F:0,'f*':0,B:0,'B*':0,b:0,'b*':0,w:1,J:1,j:1,M:1,rg:3,RG:3,g:1,G:1,k:4,K:4};

async function analyze(bytes,pageIndex) {
  const doc=await PDFDocument.load(bytes,{updateMetadata:false}); requireEditableForm(doc);
  const page=doc.getPage(pageIndex); if(!page) unsupported();
  const contents=page.node.Contents(), streams=contents instanceof PDFArray?contents.asArray().map(ref=>doc.context.lookup(ref)):contents?[contents]:[];
  const fonts=page.node.Resources()?.lookupMaybe(PDFName.of('Font'),PDFDict);
  const runs=[],decoded=[],stack=[],cache=new Map();
  let state={ctm:identity(),safe:true,font:null,size:0,Tc:0,Tw:0,Tz:100,Ts:0,Tr:0};
  let inText=false,block,matrix,args=[];
  for(const [streamIndex,stream] of streams.entries()) {
    if(!(stream instanceof PDFRawStream)) unsupported();
    const source=byteString(decodePDFRawStream(stream).decode()); decoded.push(source);
    for(const token of contentTokens(source)) {
      if(token.kind!=='operator') { args.push(token); continue; }
      const op=token.raw,nums=args.map(x=>Number(x.raw)),numeric=n=>args.length===n&&nums.every(Number.isFinite);
      if(op==='BT'&&!inText&&!args.length) { inText=true; block={valid:true,shows:0,run:null}; matrix=identity(); }
      else if(op==='ET'&&inText&&!args.length) {
        if(block.valid&&block.shows===1&&block.run) runs.push({...block.run,id:runs.length});
        if(state.Tr>=4) state.safe=false; inText=false;
      } else if(op==='Tf'&&args.length===2&&args[0].raw.startsWith('/')&&Number.isFinite(nums[1])&&nums[1]>0) {
        state.font=fonts?.lookupMaybe(PDFName.of(args[0].raw.slice(1)),PDFDict); state.size=nums[1];
      } else if(['Tc','Tw','Tz','Ts','Tr'].includes(op)&&numeric(1)) state[op]=nums[0];
      else if(op==='TL'&&numeric(1)) { /* only terminal line advances are allowed */ }
      else if(op==='Tm'&&inText&&numeric(6)) matrix=nums;
      else if((op==='Td'||op==='TD')&&inText&&numeric(2)&&block.shows===0) matrix=multiply(matrix,[1,0,0,1,...nums]);
      else if(op==='T*'&&inText&&!args.length) { if(!block.shows) block.valid=false; }
      else if(['Tj','TJ',"'",'"'].includes(op)&&inText) {
        block.shows++;
        if(op!=='Tj'||args.length!==1||!state.safe||!state.font||!state.size||!horizontal(state.ctm)||!horizontal(matrix)||state.Tc||state.Tw||state.Tz!==100||state.Ts||state.Tr) block.valid=false;
        else {
          try {
            if(!cache.has(state.font)) cache.set(state.font,await inlineFont(doc,state.font));
            const font=cache.get(state.font),text=font.decode(stringBytes(args[0].raw));
            const transform=multiply(state.ctm,matrix),x=transform[4],y=transform[5],size=state.size*transform[3],width=font.width(text)*state.size*transform[0];
            const box=page.getCropBox();
            if(x<box.x||y<box.y||x+width>box.x+box.width+0.1||y+size>box.y+box.height+0.1) block.valid=false;
            block.run={streamIndex,start:args[0].start,end:args[0].end,text,x,y,size,width,base:font.base,font,widthScale:state.size*transform[0]};
          } catch { block.valid=false; }
        }
      } else if(op==='q'&&!inText&&!args.length) stack.push({...state,ctm:[...state.ctm]});
      else if(op==='Q'&&!inText&&!args.length&&stack.length) state=stack.pop();
      else if(op==='cm'&&!inText&&numeric(6)) state.ctm=multiply(state.ctm,nums);
      else if((op==='W'||op==='W*')&&!inText&&!args.length) state.safe=false;
      else if(op==='gs'&&!inText&&args.length===1&&args[0].raw.startsWith('/')) state.safe=false;
      else if(op==='Do'&&!inText&&args.length===1&&args[0].raw.startsWith('/')) { /* XObjects execute in isolated state; their contents remain unedited. */ }
      else if(op==='d'&&!inText&&args.length===2&&args[0].raw.startsWith('[')&&Number.isFinite(nums[1])) { /* stroke dash */ }
      else if(Object.hasOwn(graphics,op)&&numeric(graphics[op])) { /* graphics remain verbatim */ }
      else unsupported();
      args=[];
    }
  }
  if(inText||args.length||stack.length) unsupported();
  const safeRuns=runs.filter(a=>!runs.some(b=>a!==b&&a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.size&&b.y<a.y+a.size));
  if(!safeRuns.length&&streams.length) unsupported();
  return {doc,page,streams,decoded,runs:safeRuns};
}
export async function inspectInlineText(bytes,pageIndex) { return (await analyze(bytes,pageIndex)).runs.map(({font,widthScale,...run})=>run); }
export async function replaceInlineText(bytes,pageIndex,id,expected,value) {
  if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value)) throw new Error('Use a single line of printable text.');
  const {doc,page,streams,decoded,runs}=await analyze(bytes,pageIndex),run=runs.find(item=>item.id===id);
  if(!run||run.text!==expected) throw new Error('The selected text changed. Select it again.');
  const encoded=run.font.encode(value);
  if(run.font.width(value)*run.widthScale>run.width+0.01) throw new Error('Replacement must fit the original text width. Reflow and font substitution are unsupported.');
  const hex='<'+Array.from(encoded,c=>c.toString(16).padStart(2,'0')).join('')+'>';
  const source=decoded[run.streamIndex],next=source.slice(0,run.start)+hex+source.slice(run.end);
  const refs=streams.map((stream,i)=>doc.context.register(i===run.streamIndex?doc.context.flateStream(Uint8Array.from(next,c=>c.charCodeAt(0))):stream));
  page.node.set(PDFName.of('Contents'),doc.context.obj(refs));
  return new Uint8Array(await doc.save({updateFieldAppearances:false}));
}
