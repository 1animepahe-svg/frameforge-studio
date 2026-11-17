'use strict';
const assert=require('node:assert/strict');
const {optimize}=require('./optimizer');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};
const box=(type,...parts)=>{const body=Buffer.concat(parts);return Buffer.concat([u32(body.length+8),Buffer.from(type,'latin1'),body])};
const full=Buffer.alloc(4), one=u32(1);
function fixture({bits=4,packed=Buffer.from([0xf0]),map=null,extra=null,omit=null}={}) {
 const entry=Buffer.alloc(78);entry.writeUInt16BE(1,6);
 const stsd=box('stsd',full,one,box('avc1',entry));
 const size=box('stz2',full,Buffer.from([0,0,0,bits]),one,packed);
 const mapping=map||box('stsc',full,one,one,one,one);
 const timing=box('stts',full,one,one,one);
 const offset=box('stco',full,one,u32(24));
 const stbl=box('stbl',...[stsd,mapping,size,timing,offset,extra].filter(x=>x&&(!omit||x.toString('ascii',4,8)!==omit)));
 const dinf=box('dinf',box('dref',full,one,box('url ',Buffer.from([0,0,0,1]))));
 return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('mdat',Buffer.alloc(32,42)),box('moov',box('trak',box('mdia',box('minf',dinf,stbl))))]);
}
(async()=>{
 for(const [bits,packed] of [[4,Buffer.from([0xf0])],[8,Buffer.from([15])],[16,Buffer.from([0,15])]]) {const r=await optimize(new Blob([fixture({bits,packed})]));assert(!r.already);console.log('PASS compact sample sizes',bits)}
 const front=Buffer.from(await (await optimize(new Blob([fixture()]))).blob.arrayBuffer());
 const brokenFront=Buffer.from(front);brokenFront.writeUInt32BE(2,brokenFront.indexOf('stsc')+16);
 await assert.rejects(()=>optimize(new Blob([brokenFront])),/exceeds/);console.log('PASS reject malformed already-fast-start file');
 for(const [label,opts,re] of [
  ['truncated compact size',{bits:16,packed:Buffer.from([15])},/length/],
  ['compact sample exceeds mdat',{bits:8,packed:Buffer.from([33])},/outside/],
  ['unsupported compact size bits',{bits:12,packed:Buffer.from([0,0])},/compact/],
  ['duplicate sample table',{extra:box('stsz',full,u32(2),one)},/duplicate/],
  ['missing timing table',{omit:'stts'},/incomplete/],
  ['mapping beyond last chunk',{map:box('stsc',full,u32(2),one,one,one,u32(2),one,one)},/Incomplete/],
  ['offset-bearing nested box',{extra:box('saio',full,one,u32(24))},/Unsupported/],
 ]) {await assert.rejects(()=>optimize(new Blob([fixture(opts)])),re);console.log('PASS reject',label)}
})().catch(e=>{console.error(e);process.exitCode=1});
