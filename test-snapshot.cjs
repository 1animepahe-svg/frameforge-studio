'use strict';
const assert=require('node:assert/strict');
const {start}=require('./snapshot');
const originalReader=global.FileReader, originalBlob=global.Blob;
const bytes=async b=>Array.from(new Uint8Array(await b.arrayBuffer()));
(async()=>{
 let called=false;
 global.FileReader=class{readAsArrayBuffer(){called=true;this.result=Uint8Array.from([1,2,3]).buffer;queueMicrotask(()=>this.onload())}};
 const primary=start({size:3,type:'video/mp4'});assert(called,'first read must begin synchronously');assert.deepEqual(await bytes(await primary),[1,2,3]);console.log('PASS synchronous first read and exact primary snapshot');
 let streamCalls=0;
 global.FileReader=class{readAsArrayBuffer(){this.error=new DOMException('revoked','NotReadableError');queueMicrotask(()=>this.onerror())}};
 const shared=new Uint8Array(4);let i=0;
 const source={size:4,type:'video/mp4',stream(){streamCalls++;return {getReader(){return {async read(){if(i===0){i++;shared.set([9,1,2,9]);return {done:false,value:shared.subarray(1,3)}}if(i===1){i++;shared.set([9,3,4,9]);return {done:false,value:shared.subarray(1,3)}}return {done:true}},releaseLock(){}}}}}};
 assert.deepEqual(await bytes(await start(source)),[1,2,3,4]);assert.equal(streamCalls,1);console.log('PASS stream reused backing buffer and subarray bytes copied');
 for(const [label,chunks,size] of [['short',[[1]],2],['long',[[1,2,3]],2],['invalid',[new Uint16Array([1])],2]]){
  let idx=0,cancelled=false,released=false;
  const f={size,stream(){return {getReader(){return {async read(){return idx<chunks.length?{done:false,value:chunks[idx] instanceof Uint16Array?chunks[idx++]:Uint8Array.from(chunks[idx++])}:{done:true}},async cancel(){cancelled=true},releaseLock(){released=true}}}}}};
  await assert.rejects(start(f),e=>e.name==='NotReadableError');assert(cancelled&&released);console.log('PASS rejects '+label+' stream and cleans up');
 }
 let fallbacks=0;
 global.FileReader=class{readAsArrayBuffer(){this.error=new DOMException('aborted','AbortError');queueMicrotask(()=>this.onerror())}};
 await assert.rejects(start({size:1,stream(){fallbacks++}}),e=>e.name==='AbortError');assert.equal(fallbacks,0);console.log('PASS abort does not fall back');
 global.FileReader=class{readAsArrayBuffer(){this.result=Uint8Array.from([7]).buffer;queueMicrotask(()=>this.onload())}};
 global.Blob=class{constructor(){throw new RangeError('allocation failed')}};
 await assert.rejects(start({size:1,stream(){fallbacks++}}),/allocation failed/);assert.equal(fallbacks,0);console.log('PASS snapshot allocation failure does not re-read');
 global.Blob=originalBlob;global.FileReader=undefined;
 let started=false;const data=Uint8Array.from([8,9]).buffer;
 const promise=start({size:2,type:'video/mp4',arrayBuffer(){started=true;return Promise.resolve(data)}});assert(started);const result=await promise;new Uint8Array(data)[0]=0;assert.deepEqual(await bytes(result),[8,9]);console.log('PASS arrayBuffer fallback and snapshot independence');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.FileReader=originalReader;global.Blob=originalBlob});
