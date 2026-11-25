const identity=()=>[1,0,0,1,0,0];
const mult=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1;

export function formGeometry(list,OPS) {
  let matrix=identity(),stack=[],pending=[],rectangles=[],lines=[],annotation=0;
  function segment(a,b){if(Math.abs(a[0]-b[0])<.2||Math.abs(a[1]-b[1])<.2)pending.push({a,b});}
  function flush(stroke,close=false){
    if(close&&pending.length&&pending.every(item=>item.a))segment(pending.at(-1).b,pending[0].a);
    if(stroke){
      const edges=pending.filter(item=>item.a);
      if(edges.length===4){
        const xs=edges.flatMap(e=>[e.a[0],e.b[0]]),ys=edges.flatMap(e=>[e.a[1],e.b[1]]),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
        const length=edges.reduce((sum,e)=>sum+Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),0);
        if(width>0&&height>0&&Math.abs(length-2*(width+height))<.2)rectangles.push({x,y,width,height});
      }
      for(const item of pending){if(item.rect)rectangles.push(item.rect);else lines.push(item);}
    }
    pending=[];
  }
  for(let i=0;i<list.fnArray.length;i++){
    if(i>250000)throw new Error('This page is too complex for automatic field recognition.');
    const op=list.fnArray[i],a=list.argsArray[i]||[];
    if(op===OPS.beginAnnotation){annotation++;continue;}if(op===OPS.endAnnotation){annotation--;continue;}if(annotation)continue;
    if(op===OPS.save||op===OPS.paintFormXObjectBegin){stack.push([...matrix]);if(op===OPS.paintFormXObjectBegin&&a[0])matrix=mult(matrix,a[0]);}
    else if(op===OPS.restore||op===OPS.paintFormXObjectEnd){matrix=stack.pop()||identity();}
    else if(op===OPS.transform)matrix=mult(matrix,a);
    else if(op===OPS.constructPath){
      const [ops,coords]=a;let j=0,current=null,start=null;
      for(const pathOp of ops){
        if(pathOp===OPS.rectangle){const [x,y,w,h]=coords.slice(j,j+4);j+=4;const p=point(matrix,x,y),q=point(matrix,x+w,y+h);if(Math.abs(matrix[1])<.001&&Math.abs(matrix[2])<.001)pending.push({rect:{x:Math.min(p[0],q[0]),y:Math.min(p[1],q[1]),width:Math.abs(q[0]-p[0]),height:Math.abs(q[1]-p[1])}});}
        else if(pathOp===OPS.moveTo){current=point(matrix,coords[j++],coords[j++]);start=current;}
        else if(pathOp===OPS.lineTo){const next=point(matrix,coords[j++],coords[j++]);if(current)segment(current,next);current=next;}
        else if(pathOp===OPS.closePath){if(current&&start)segment(current,start);current=start;}
        else if(pathOp===OPS.curveTo){current=point(matrix,coords[j+4],coords[j+5]);j+=6;}
        else if(pathOp===OPS.curveTo2||pathOp===OPS.curveTo3){current=point(matrix,coords[j+2],coords[j+3]);j+=4;}
      }
    }else if([OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(op))flush(true,[OPS.closeStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(op));
    else if([OPS.fill,OPS.eoFill,OPS.endPath].includes(op))flush(false);
  }
  const rawHorizontal=lines.filter(l=>Math.abs(l.a[1]-l.b[1])<.2&&Math.abs(l.a[0]-l.b[0])>.1).map(l=>({x:Math.min(l.a[0],l.b[0]),y:(l.a[1]+l.b[1])/2,width:Math.abs(l.a[0]-l.b[0])})).sort((a,b)=>Math.round(a.y*3)-Math.round(b.y*3)||a.x-b.x);
  const joined=[];
  for(const line of rawHorizontal){const previous=joined.at(-1);if(previous&&Math.abs(previous.y-line.y)<.3&&line.x<=previous.x+previous.width+3)previous.width=Math.max(previous.x+previous.width,line.x+line.width)-previous.x;else joined.push({...line});}
  const horizontal=joined.filter(line=>line.width>20);
  const vertical=lines.filter(l=>Math.abs(l.a[0]-l.b[0])<.2&&Math.abs(l.a[1]-l.b[1])>7).map(l=>({x:(l.a[0]+l.b[0])/2,y:Math.min(l.a[1],l.b[1]),height:Math.abs(l.a[1]-l.b[1])}));
  // Infer closed empty table cells from stroked grid intersections.
  const cells=[];
  if(horizontal.length<1500&&vertical.length<1500)for(const top of horizontal){
    const bottoms=horizontal.filter(b=>top.y-b.y>=8&&top.y-b.y<=40&&Math.min(top.x+top.width,b.x+b.width)-Math.max(top.x,b.x)>20).sort((a,b)=>b.y-a.y);
    for(const bottom of bottoms.slice(0,4)){
      const xs=vertical.filter(v=>v.y<=bottom.y+.5&&v.y+v.height>=top.y-.5&&v.x>=Math.max(top.x,bottom.x)-.5&&v.x<=Math.min(top.x+top.width,bottom.x+bottom.width)+.5).map(v=>v.x).sort((a,b)=>a-b).filter((x,i,all)=>i===0||x-all[i-1]>.5);
      for(let k=1;k<xs.length;k++)if(xs[k]-xs[k-1]>20&&xs[k]-xs[k-1]<300)cells.push({x:xs[k-1]+1,y:bottom.y+1,width:xs[k]-xs[k-1]-2,height:top.y-bottom.y-2});
    }
  }
  return {rectangles,horizontal,cells};
}

export function suggestFormFields(geometry,isBlank,pageIndex,existing=[]) {
  const {rectangles,horizontal,cells}=geometry;
  const boxes=rectangles.filter(r=>r.width>=8&&r.width<=18&&r.height>=8&&r.height<=18&&Math.abs(r.width-r.height)<2).sort((a,b)=>b.y-a.y||a.x-b.x);
  const grouped=new Set(),result=[];
  function add(rect,type,reason,comb,blankOverride=false){
    if(rect.width<8||rect.height<8||rect.width>550||rect.height>40||(!blankOverride&&!isBlank(rect))||existing.some(w=>overlap(w.rect,rect))||result.some(p=>overlap(p.rect,rect)))return;
    result.push({id:`proposal-${result.length}`,pageIndex,rect,type,reason,...(comb?{comb}:{})});
  }
  for(let i=0;i<boxes.length;i++){
    if(grouped.has(i))continue;const group=[i];let last=boxes[i];
    for(let j=i+1;j<boxes.length;j++)if(!grouped.has(j)&&Math.abs(boxes[j].y-last.y)<.6&&Math.abs(boxes[j].height-last.height)<.6&&Math.abs(boxes[j].x-last.x-last.width)<.7){group.push(j);last=boxes[j];}
    if(group.length>=3&&group.every(k=>isBlank(boxes[k]))){group.forEach(k=>grouped.add(k));const first=boxes[i];add({x:first.x,y:first.y,width:last.x+last.width-first.x,height:first.height},'text','Character boxes',group.length,true);}
  }
  boxes.forEach((r,i)=>{if(!grouped.has(i))add({...r},'checkbox','Square checkbox');});
  for(const r of [...cells,...rectangles.filter(r=>r.width>20&&r.height>=8&&r.height<=40)])add(r,'text','Empty bordered area');
  for(const l of horizontal.filter(l=>l.width>=25&&l.width<=550&&![...rectangles,...result.map(p=>p.rect)].some(r=>Math.abs(r.x-l.x)<.5&&Math.abs(r.width-l.width)<.5&&(Math.abs(r.y-l.y)<.5||Math.abs(r.y+r.height-l.y)<.5))))add({x:l.x+1,y:l.y+1,width:l.width-2,height:8},'text','Blank above a line');
  return result.sort((a,b)=>b.rect.y-a.rect.y||a.rect.x-b.rect.x).slice(0,500);
}

export async function recognizePageFields(pdf,pageIndex,OPS,existing=[]) {
  const page=await pdf.getPage(pageIndex+1),viewport=page.getViewport({scale:1.5,rotation:0});
  if(viewport.width*viewport.height>16000000)throw new Error('Page is too large for field recognition.');
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  await page.render({canvasContext:context,viewport,annotationMode:0}).promise;
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  const isBlank=rect=>{
    const r=viewport.convertToViewportRectangle([rect.x+1.5,rect.y+1.5,rect.x+rect.width-1.5,rect.y+rect.height-1.5]);
    const left=Math.max(0,Math.ceil(Math.min(r[0],r[2]))),right=Math.min(canvas.width,Math.floor(Math.max(r[0],r[2]))),top=Math.max(0,Math.ceil(Math.min(r[1],r[3]))),bottom=Math.min(canvas.height,Math.floor(Math.max(r[1],r[3])));
    let dark=0,total=0;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const offset=(y*canvas.width+x)*4;total++;if(Math.min(pixels[offset],pixels[offset+1],pixels[offset+2])<200)dark++;}
    return total>0&&dark/total<.004;
  };
  const list=await page.getOperatorList({annotationMode:0});
  return suggestFormFields(formGeometry(list,OPS),isBlank,pageIndex,existing);
}
