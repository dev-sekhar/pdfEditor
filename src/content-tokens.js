// Lossless byte offsets and balanced strings/composite operands.
export function contentTokens(source) {
  let at=0;
  const white=c=>/[\x00\t\n\f\r ]/.test(c);
  function skip() {
    while(at<source.length) {
      if(white(source[at])) at++;
      else if(source[at]==='%') { while(at<source.length&&!/[\r\n]/.test(source[at])) at++; }
      else break;
    }
  }
  function read() {
    skip(); const start=at; let kind='operand'; const c=source[at++];
    if(c==='(') {
      let depth=1;
      while(at<source.length&&depth) { const ch=source[at++]; if(ch==='\\') at++; else if(ch==='(') depth++; else if(ch===')') depth--; }
      if(depth||at>source.length) throw new Error('Malformed PDF string.');
    } else if(c==='[') {
      skip(); while(at<source.length&&source[at]!==']') { read(); skip(); }
      if(source[at++]!==']') throw new Error('Malformed PDF array.');
    } else if(c==='<') {
      if(source[at]==='<') throw new Error('Inline content dictionaries are unsupported.');
      while(at<source.length&&source[at]!=='>') at++;
      if(source[at++]!=='>') throw new Error('Malformed PDF hex string.');
    } else {
      while(at<source.length&&!white(source[at])&&!/[()[\]<>/%]/.test(source[at])) at++;
      const raw=source.slice(start,at);
      if(c!=='/'&&!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)&&!['true','false','null'].includes(raw)) kind='operator';
    }
    return {raw:source.slice(start,at),start,end:at,kind};
  }
  const result=[]; skip(); while(at<source.length) { result.push(read()); skip(); } return result;
}
export function byteString(bytes) {
  // TextDecoder('latin1') uses Windows-1252 and corrupts high bytes.
  let result=''; for(let i=0;i<bytes.length;i+=8192) result+=String.fromCharCode(...bytes.subarray(i,i+8192)); return result;
}
