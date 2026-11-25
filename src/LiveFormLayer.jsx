import React, { useEffect, useState } from 'react';
import { inspectForms } from './forms';

export default function LiveFormLayer({ bytes,pageIndex,viewport,values,onChange,disabled }) {
  const [fields,setFields]=useState([]),[error,setError]=useState('');
  useEffect(()=>{let live=true;inspectForms(bytes).then(items=>{if(live){setFields(items);setError('');}}).catch(cause=>{if(live)setError(cause.message);});return()=>{live=false;};},[bytes]);
  const widgets=fields.flatMap(field=>field.widgets.map((widget,i)=>({...widget,field,widgetIndex:i}))).filter(w=>w.pageIndex===pageIndex).sort((a,b)=>b.rect.y-a.rect.y||a.rect.x-b.rect.x);
  return <div className="live-form-layer" aria-label="Interactive PDF fields">
    {error&&<p role="alert">{error}</p>}
    {widgets.map(({field,rect,widgetIndex})=>{
      if(field.type==='unsupported')return null;
      const r=viewport.convertToViewportRectangle([rect.x,rect.y,rect.x+rect.width,rect.y+rect.height]);
      const style={left:Math.min(r[0],r[2]),top:Math.min(r[1],r[3]),width:Math.abs(r[2]-r[0]),height:Math.abs(r[3]-r[1]),fontSize:Math.max(6,Math.min(12,rect.height*.65))*viewport.scale};
      if(field.combed&&field.maxLength){const cell=style.width/field.maxLength;style.fontFamily='monospace';style.letterSpacing=Math.max(0,cell-style.fontSize*.6);style.paddingLeft=Math.max(0,cell/2-style.fontSize*.3);}
      const value=Object.hasOwn(values,field.name)?values[field.name]:field.value;
      const common={className:'native-pdf-field',style,'aria-label':field.name,disabled:disabled||field.readOnly,required:field.required,'data-field-name':field.name};
      const update=next=>onChange(field.name,next,field.value);
      let input;
      if(field.type==='checkbox')input=<input {...common} type="checkbox" checked={Boolean(value)} onChange={e=>update(e.target.checked)}/>;
      else if(field.type==='radio')input=<input {...common} aria-label={`${field.name}: ${field.options[widgetIndex]}`} type="radio" name={field.name} checked={value===field.options[widgetIndex]} onChange={()=>update(field.options[widgetIndex])}/>;
      else if(field.type==='dropdown'||field.type==='list')input=<select {...common} multiple={field.multiselect} value={field.multiselect?(value||[]):Array.isArray(value)?value[0]||'':value||''} onChange={e=>update(field.type==='list'?Array.from(e.target.selectedOptions,o=>o.value).filter(Boolean):e.target.value)}><option value="">Choose…</option>{field.options.map(option=><option key={option}>{option}</option>)}</select>;
      else if(field.multiline)input=<textarea {...common} maxLength={field.maxLength} value={value??''} onChange={e=>update(e.target.value)}/>;
      else input=<input {...common} type="text" maxLength={field.maxLength} value={value??''} onChange={e=>update(e.target.value)}/>;
      return <React.Fragment key={field.name+'-'+widgetIndex}>{input}</React.Fragment>;
    })}
  </div>;
}
