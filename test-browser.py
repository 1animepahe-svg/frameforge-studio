# Local Chromium integration tests. Requires Python playwright and Chromium.
import os, sys, tempfile, subprocess, threading, functools, http.server, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:%d/index.html#enhancer'%server.server_port
with tempfile.TemporaryDirectory() as t:
 src=Path(t)/'video.mp4'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=96x96:rate=10','-t','1','-c:v','libx264','-pix_fmt','yuv420p',str(src)],check=True)
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  p=b.new_page(viewport={'width':390,'height':844},accept_downloads=True);p.set_default_timeout(5000)
  errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(url);p.locator('#file').set_input_files(str(src));p.wait_for_function("document.querySelector('#engine-status').textContent==='READY'")
  assert not p.locator('#process').is_disabled();p.locator('#process').click();p.wait_for_function("document.querySelector('#engine-status').textContent==='DONE'")
  with p.expect_download() as d:p.locator('#download').click()
  output=Path(t)/'result.mp4';d.value.save_as(str(output))
  print('PASS real Chromium file selection, processing and download:',d.value.suggested_filename)
  result=subprocess.run(['ffmpeg','-v','error','-i',str(output),'-f','null','-'],capture_output=True);assert result.returncode==0,result.stderr
  print('PASS downloaded output decodes')
  def frames(path):
   return subprocess.run(['ffmpeg','-v','error','-i',str(path),'-map','0:v:0','-f','framemd5','-'],capture_output=True,check=True).stdout
  assert frames(src)==frames(output)
  print('PASS source and downloaded decoded video frame hashes match')
  # Simulate provider-level NotReadableError in the real UI, and verify a
  # separately selected working copy recovers without reload.
  p.evaluate('''() => {window.RealReader=window.FileReader; window.originalStream=File.prototype.stream; window.FileReader=class {readAsArrayBuffer(){this.error=new DOMException('revoked','NotReadableError');queueMicrotask(()=>this.onerror())}};File.prototype.stream=function(){return new ReadableStream({start(c){c.error(new DOMException('revoked','NotReadableError'))}})}}''')
  p.evaluate("document.querySelector('#file').value=''");p.locator('#file').set_input_files(str(src));p.wait_for_function("document.querySelector('#engine-status').textContent==='READ FAILED'")
  assert p.locator('#process').is_disabled();assert 'Downloads' in p.locator('#log').inner_text();assert not p.locator('#download').get_attribute('href')
  p.evaluate('''() => {window.FileReader=window.RealReader;File.prototype.stream=window.originalStream}''')
  p.evaluate("document.querySelector('#file').value=''");p.locator('#file').set_input_files(str(src));p.wait_for_function("document.querySelector('#engine-status').textContent==='READY'");p.locator('#process').click();p.wait_for_function("document.querySelector('#engine-status').textContent==='DONE'")
  print('PASS simulated NotReadableError failure, no output, same-file reselect and recovery')
  # First method fails but sequential stream works.
  p.evaluate('''() => {window.FileReader=class {readAsArrayBuffer(){this.error=new DOMException('revoked','NotReadableError');queueMicrotask(()=>this.onerror())}}}''')
  p.evaluate("document.querySelector('#file').value=''");p.locator('#file').set_input_files(str(src));p.wait_for_function("document.querySelector('#engine-status').textContent==='READY'");p.locator('#process').click();p.wait_for_function("document.querySelector('#engine-status').textContent==='DONE'")
  print('PASS simulated first-read failure, stream fallback and optimize')
  p.evaluate('() => {window.FileReader=window.RealReader}')
  # Delay read completion: a drop must not replace the in-flight selection.
  p.evaluate('''() => {window.realStart=FrameforgeSnapshot.start;FrameforgeSnapshot.start=f=>{const reading=realStart(f);return new Promise((resolve,reject)=>{window.finishRead=()=>reading.then(resolve,reject)})}}''')
  p.evaluate("document.querySelector('#file').value=''");p.locator('#file').set_input_files(str(src))
  p.wait_for_function("document.querySelector('#engine-status').textContent==='READING'")
  assert p.locator('#file').is_disabled() and p.locator('#clear').is_disabled() and p.locator('#process').is_disabled()
  p.evaluate('''() => {const dt=new DataTransfer();dt.items.add(new File(['other'],'other.mp4',{type:'video/mp4'}));document.querySelector('#dropzone').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}''')
  assert p.locator('#filename').inner_text()=='video.mp4';p.evaluate('finishRead()')
  p.wait_for_function("document.querySelector('#engine-status').textContent==='READY'")
  assert not p.locator('#file').is_disabled();p.evaluate('() => {FrameforgeSnapshot.start=realStart}')
  print('PASS delayed read locks selection and ignores competing drop')
  # A failed reprocess must not expose the previous output or retained previews.
  p.locator('#process').click();p.wait_for_function("document.querySelector('#engine-status').textContent==='DONE'")
  p.evaluate('''() => {window.realOptimize=FrameforgeOptimizer.optimize;FrameforgeOptimizer.optimize=async()=>{throw new Error('simulated failure')}}''')
  p.locator('#process').click();p.wait_for_function("document.querySelector('#engine-status').textContent==='REJECTED'")
  assert p.locator('#download').get_attribute('href') is None
  assert p.locator('#compare-ready').is_hidden() and not p.locator('#process').is_disabled()
  assert p.locator('#original').get_attribute('src') is None and p.locator('#output').get_attribute('src') is None
  p.evaluate('() => {FrameforgeOptimizer.optimize=realOptimize}')
  print('PASS failed reprocess clears old output and preview resources')
  # A setup exception after creating an output URL must not leave it downloadable.
  p.evaluate('''() => {Object.defineProperty(document.querySelector('#output'),'src',{configurable:true,set(){throw new Error('preview setup failed')}})}''')
  p.locator('#process').click();p.wait_for_function("document.querySelector('#engine-status').textContent==='REJECTED'")
  assert p.locator('#download').get_attribute('href') is None and p.locator('#compare-ready').is_hidden()
  assert not p.locator('#process').is_disabled()
  p.evaluate("() => {delete document.querySelector('#output').src}")
  print('PASS failure after output URL creation revokes and hides output')
  # Actual browser-backed file goes stale between acquisition and read.
  p.evaluate("() => {let i=document.createElement('input');i.type='file';i.id='test-stale';document.body.append(i)}")
  stale=Path(t)/'stale.mp4';stale.write_bytes(b'abc');p.locator('#test-stale').set_input_files(str(stale));p.evaluate("() => {window.staleFile=document.querySelector('#test-stale').files[0]}");stale.unlink()
  outcome=p.evaluate('''async()=>{try{await document.querySelector('#test-stale').files[0].arrayBuffer();return 'unexpected success'}catch(e){return e.name}}''')
  assert outcome in ('NotReadableError','NotFoundError'),outcome
  stale_result=p.evaluate('''async()=>{try{await FrameforgeSnapshot.start(window.staleFile);return 'unexpected success'}catch(e){return e.name}}''')
  assert stale_result in ('NotReadableError','NotFoundError'),stale_result
  print('PASS real Chromium stale file:',outcome,'snapshot rejects:',stale_result)
  assert not errors,errors
  b.close()
server.shutdown()
