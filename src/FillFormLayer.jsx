import React, { useEffect, useState } from 'react';
import { diagnoseForms } from './forms';

export default function FillFormLayer({ bytes, viewport, annotations=[], disabled, onApply }) {
  const [allowed,setAllowed]=useState(false),[message,setMessage]=useState('Checking document…');
  const [entry,setEntry]=useState(null),[text,setText]=useState(''),[size,setSize]=useState(10),[mode,setMode]=useState('text');
  useEffect(()=>{
    let live=true; setAllowed(false);
    diagnoseForms(bytes).then(info=>{if(live){setAllowed(!info.protected);setMessage(info.protected?info.message:'Click a blank space, type, and apply. Mark checkbox adds an X. Entries are text overlays, not original interactive fields.');}}).catch(error=>{if(live)setMessage(error.message);});
    return()=>{live=false;};
  },[bytes]);
  const point=entry?viewport.convertToViewportPoint(entry.x,entry.y):null;
  return <div className="fill-form-layer" aria-label="Fill printed form" onClick={event=>{
    if(disabled||!allowed||event.target!==event.currentTarget)return;
    const box=event.currentTarget.getBoundingClientRect();
    const [x,y]=viewport.convertToPdfPoint(event.clientX-box.left,event.clientY-box.top);
    setEntry({x,y});setText(mode==='check'?'X':'');
  }}>
    <div className="fill-form-help" onClick={event=>event.stopPropagation()}>
      <span role="status">{message}</span>
      <label>Entry type <select aria-label="Form entry type" value={mode} onChange={event=>{setMode(event.target.value);setEntry(null);}}><option value="text">Text</option><option value="check">Mark checkbox (X)</option></select></label>
      <label>Size <input aria-label="Form entry size" type="number" min="6" max="72" value={size} onChange={event=>setSize(event.target.value)}/></label>
    </div>
    {annotations.filter(item=>item.type==='text').map(item=>{
      const [x,y]=viewport.convertToViewportPoint(item.x,item.y);
      return <button key={item.id} className="fill-entry-target" style={{left:x,top:y-item.size*viewport.scale}} aria-label={'Edit form entry: '+item.text} disabled={disabled||!allowed} onClick={event=>{event.stopPropagation();setEntry(item);setText(item.text);setSize(item.size);}}>Edit</button>;
    })}
    {entry&&allowed&&<form className="fill-entry-editor" style={{left:Math.max(0,Math.min(viewport.width-240,point[0])),top:Math.max(0,point[1]-Number(size)*viewport.scale)}} onClick={event=>event.stopPropagation()} onSubmit={async event=>{
      event.preventDefault();
      try {
        await onApply({...entry,text,size:Number(size),font:entry.font||'Helvetica',color:entry.color||'#000000'});
        setEntry(null);
      } catch(error){setMessage(error.message);}
    }}>
      <input autoFocus aria-label="Form entry text" value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setEntry(null);}}}/>
      <button disabled={disabled||!text.trim()||!Number.isFinite(Number(size))||Number(size)<6||Number(size)>72}>Apply entry</button>
      <button type="button" onClick={()=>setEntry(null)}>Cancel</button>
    </form>}
  </div>;
}
