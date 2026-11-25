import React,{useState} from 'react';
export default function FieldRecognitionLayer({proposals,viewport,onAccept,onCancel,disabled}){
  const [excluded,setExcluded]=useState(new Set());
  return <div className="recognition-layer" aria-label="Review recognized fields">
    <div className="recognition-controls">
      <p>Review {proposals.length} suggested fields. Click a box to exclude/include it. Detection does not read outlined labels or infer checkbox groups.</p>
      <button disabled={disabled||excluded.size===proposals.length} onClick={()=>onAccept(proposals.filter(p=>!excluded.has(p.id)))}>Create {proposals.length-excluded.size} interactive fields</button>
      <button disabled={disabled} onClick={onCancel}>Cancel detection</button>
    </div>
    {proposals.map(p=>{const r=viewport.convertToViewportRectangle([p.rect.x,p.rect.y,p.rect.x+p.rect.width,p.rect.y+p.rect.height]);return <button key={p.id} className={'recognized-field '+(excluded.has(p.id)?'excluded':'')} style={{left:Math.min(r[0],r[2]),top:Math.min(r[1],r[3]),width:Math.abs(r[2]-r[0]),height:Math.abs(r[3]-r[1])}} aria-label={`${p.type} proposal ${p.id}`} aria-pressed={!excluded.has(p.id)} title={`${p.type}: ${p.reason}. Click to toggle.`} onClick={()=>setExcluded(old=>{const next=new Set(old);next.has(p.id)?next.delete(p.id):next.add(p.id);return next;})}/>;})}
  </div>;
}
