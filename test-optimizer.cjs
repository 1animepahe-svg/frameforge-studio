// Run: node test-optimizer.cjs /path/to/trailing-moov.mp4 /path/to/faststart.mp4 /path/to/fragmented.mp4
const assert=require('node:assert/strict'),fs=require('node:fs');const {optimize}=require('./optimizer.js');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};const box=(t,...payload)=>{const p=Buffer.concat(payload);return Buffer.concat([u32(p.length+8),Buffer.from(t,'latin1'),p])};
const full=Buffer.alloc(4);function synthetic(type='co64',offset=24,external=false){const ftyp=box('ftyp',Buffer.from('isom0000')),mdat=box('mdat',Buffer.alloc(32,42));const entry=Buffer.alloc(78);entry.writeUInt16BE(1,6);const stsd=box('stsd',full,u32(1),box('avc1',entry));const val=type==='co64'?Buffer.alloc(8):u32(offset);if(type==='co64')val.writeBigUInt64BE(BigInt(offset));const table=box(type,full,u32(1),val);const url=box('url ',Buffer.from([0,0,0,external?0:1]));const dref=box('dref',full,u32(1),url);const stsc=box('stsc',full,u32(1),u32(1),u32(1),u32(1)),stsz=box('stsz',full,u32(32),u32(1)),stts=box('stts',full,u32(1),u32(1),u32(1));const stbl=box('stbl',stsd,stsc,stsz,stts,table),dinf=box('dinf',dref),moov=box('moov',box('trak',box('mdia',box('minf',dinf,stbl))));return Buffer.concat([ftyp,mdat,moov])}
const blob=b=>new Blob([b],{type:'video/mp4'});async function reject(label,b,pattern){await assert.rejects(()=>optimize(blob(b)),pattern);console.log('PASS reject',label)}
(async()=>{let input=synthetic(),r=await optimize(blob(input)),out=Buffer.from(await r.blob.arrayBuffer());assert(!r.already);const p=out.indexOf('co64');assert(p>0);let originalMdat=input.indexOf('mdat')-4,newMdat=out.indexOf('mdat')-4;assert.equal(Number(out.readBigUInt64BE(p+12)),24+newMdat-originalMdat);assert.deepEqual(out.subarray(newMdat+8,newMdat+40),input.subarray(originalMdat+8,originalMdat+40));console.log('PASS synthetic co64 relocation and media preservation');
await reject('external reference',synthetic('co64',24,true),/reference/);await reject('chunk outside mdat',synthetic('stco',1),/outside/);let extended=Buffer.from(input);extended.writeUInt32BE(1,0);await reject('extended size',extended,/extended/);let truncated=Buffer.from(input);truncated.writeUInt32BE(0xffffffff,0);await reject('out of bounds',truncated,/bounds/);let unknown=Buffer.from(input);unknown.write('sidx',4,'ascii');await reject('unknown top-level',unknown,/Unsupported/);let badtable=Buffer.from(input);badtable.writeUInt32BE(0xffffffff,badtable.indexOf('co64')+8);await reject('invalid chunk count',badtable,/length/);
// Mutate complete fixtures so these failures would previously have slipped through.
for(const [label,type] of [['unknown nested','zzzz'],['offset-bearing saio','saio'],['offset-bearing iloc','iloc'],['unknown uuid','uuid']]){let b=Buffer.from(input);b.write(type,b.indexOf('stts'),'ascii');await reject(label,b,/Unsupported/)}
for(const [label,type,pos,value,pattern] of [
 ['missing sample mapping','stsc',0,'xxxx',/Unsupported/],
 ['partial sample mapping','stsz',12,2,/Incomplete|count/],
 ['too many mapped samples','stsc',16,2,/exceeds/],
 ['bad first chunk','stsc',12,2,/mapping/],
 ['bad sample description index','stsc',20,2,/description/],
 ['chunk sample overrun','stsz',8,33,/outside/],
 ['timing count mismatch','stts',12,2,/count/],
 ['truncated sizes box','stsz',-4,12,/Truncated|Unsupported|Invalid/],
 ['nonzero table flags','stsc',4,1,/flags/]
]){const b=Buffer.from(input),i=b.indexOf(type);if(typeof value==='string')b.write(value,i+pos,'ascii');else b.writeUInt32BE(value,i+pos);await reject(label,b,pattern)}
const stcoInput=synthetic('stco'),fast=await optimize(blob(stcoInput)),fastBytes=Buffer.from(await fast.blob.arrayBuffer());assert(!fast.already);assert.equal(fastBytes.readUInt32BE(fastBytes.indexOf('stco')+12),24+fastBytes.indexOf('mdat')-stcoInput.indexOf('mdat'));console.log('PASS synthetic stco relocation');
let partial=Buffer.from(input);partial.writeUInt32BE(2,partial.indexOf('stsz')+12);partial.writeUInt32BE(2,partial.indexOf('stts')+12);await reject('incomplete sample coverage',partial,/Incomplete/);
if(process.argv[2]){const tail=fs.readFileSync(process.argv[2]),x=await optimize(blob(tail)),newFile=Buffer.from(await x.blob.arrayBuffer());assert(!x.already);assert(newFile.indexOf('moov')<newFile.indexOf('mdat'));const oldPos=tail.indexOf('mdat')-4,newPos=newFile.indexOf('mdat')-4,sz=tail.readUInt32BE(oldPos);assert.deepEqual(newFile.subarray(newPos,newPos+sz),tail.subarray(oldPos,oldPos+sz));console.log('PASS real trailing-moov audio/video and mdat byte identity');}
if(process.argv[3]){const front=fs.readFileSync(process.argv[3]),x=await optimize(blob(front));assert(x.already);assert.deepEqual(Buffer.from(await x.blob.arrayBuffer()),front);console.log('PASS already fast-start byte identity')}
if(process.argv[4])await reject('fragmented',fs.readFileSync(process.argv[4]),/Unsupported/);console.log('All tests passed.');})().catch(e=>{console.error(e);process.exitCode=1});
