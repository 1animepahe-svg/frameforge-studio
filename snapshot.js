/* Read a picker file immediately into a browser-owned Blob. No network or persistent storage. */
(function(root){
'use strict';
function start(file){
  // This function must be called directly in the input change/drop handler: the
  // first read is started synchronously, before returning control to the browser.
  let first;
  if(typeof FileReader!=='undefined'){
    first=new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error||new DOMException('File read failed','NotReadableError'));
      reader.onabort=()=>reject(new DOMException('File read aborted','AbortError'));
      try{reader.readAsArrayBuffer(file)}catch(e){reject(e)}
    });
  }else{
    try{first=file.arrayBuffer()}catch(e){first=Promise.reject(e)}
  }
  // Only reading/length failures should trigger the fallback. A failed Blob
  // allocation must not cause a second full read under memory pressure.
  const complete=Promise.resolve(first).then(buffer=>{
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==file.size)throw new DOMException('Incomplete file read','NotReadableError');
    return buffer;
  });
  return complete.then(buffer=>new Blob([buffer],{type:file.type}),async error=>{
    if(error && error.name==='AbortError')throw error;
    // Some providers permit a sequential stream even when the whole-file read
    // failed. This is best effort; it cannot restore a revoked permission.
    if(typeof file.stream!=='function')throw error;
    let reader,parts=[],total=0;
    try{
      reader=file.stream().getReader();
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw new Error('Invalid stream chunk');
        total+=value.byteLength;
        if(total>file.size)throw new Error('Stream exceeds reported size');
        // A stream may reuse or mutate its backing buffer on the next read.
        // Keep our own copy of exactly the bytes in this view.
        parts.push(new Uint8Array(value));
      }
      if(total!==file.size)throw new Error('Incomplete stream');
      return new Blob(parts,{type:file.type});
    }catch(streamError){
      if(reader)try{await reader.cancel()}catch(_){}
      throw new DOMException('Could not read the selected file.','NotReadableError');
    }finally{if(reader)try{reader.releaseLock()}catch(_){} parts=[]}
  });
}
root.FrameforgeSnapshot={start};
if(typeof module!=='undefined')module.exports=root.FrameforgeSnapshot;
})(typeof globalThis!=='undefined'?globalThis:window);
