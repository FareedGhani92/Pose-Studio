import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Camera, Check, ChevronDown, CircleHelp, Code2, Crosshair, ImagePlus, LoaderCircle, Pause, Play, RotateCcw, ScanLine, ShieldCheck, SlidersHorizontal, Upload, X, Zap } from 'lucide-react';
import { drawPose, download, estimate, hasBackend, makeFrame, NAMES, type Display, type Engine, type PoseResult } from './pose';
import { usePoseTools } from './webmcp';

type Stage = 'idle' | 'loading' | 'ready' | 'camera';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export default function App() {
  const [mode, setMode] = useState<'image' | 'camera'>('image');
  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<PoseResult | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [name, setName] = useState(''); const [dragging, setDragging] = useState(false);
  const [backend, setBackend] = useState<boolean | null>(null); const [engine, setEngine] = useState<Engine>('auto');
  const [display, setDisplay] = useState<Display>({ skeleton: true, points: true, labels: false, threshold: .5, mirror: false });
  const [help, setHelp] = useState(false); const [dataOpen, setDataOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null); const video = useRef<HTMLVideoElement>(null); const file = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLCanvasElement | null>(null); const stream = useRef<MediaStream | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false); const generation = useRef(0); const abort = useRef<AbortController | null>(null);
  const helpDialog = useRef<HTMLDialogElement>(null); const dataDialog = useRef<HTMLDialogElement>(null);
  const activeEngine = engine === 'auto' ? backend ? 'server' : 'browser' : engine;
  const busy = stage === 'loading';
  const detectedCount = result?.landmarks.filter(p => p.visibility >= display.threshold).length ?? 0;
  const averageVisibility = result?.detected ? Math.round(result.landmarks.reduce((s, p) => s + p.visibility, 0) / result.landmarks.length * 100) : null;
  function stopCamera() { running.current = false; generation.current++; abort.current?.abort(); if (timer.current) clearTimeout(timer.current); stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; }
  useEffect(() => { let alive = true; hasBackend().then(value => { if (alive) setBackend(value); }); return () => { alive = false; stopCamera(); }; }, []);
  useEffect(() => { if (canvas.current && frame.current) drawPose(canvas.current, frame.current, result, { ...display, mirror: mode === 'camera' && display.mirror }); }, [result, display, mode]);
  useEffect(() => { if (help) helpDialog.current?.showModal(); else helpDialog.current?.close(); }, [help]);
  useEffect(() => { if (dataOpen) dataDialog.current?.showModal(); else dataDialog.current?.close(); }, [dataOpen]);
  useEffect(() => { const hide = () => { if (document.hidden && running.current) { stopCamera(); setStage(frame.current ? 'ready' : 'idle'); setNotice('Camera stopped while this tab was hidden.'); } }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, []);
  function reset(nextMode = mode) { stopCamera(); frame.current = null; setResult(null); setStage('idle'); setName(''); setError(''); setNotice(''); setMode(nextMode); if (file.current) file.current.value = ''; }
  usePoseTools(result, () => reset());
  async function analyzeBlob(blob: Blob, filename: string) {
    stopCamera(); const id = generation.current; const controller = new AbortController(); abort.current = controller;
    setStage('loading'); setResult(null); frame.current = null; setError(''); setNotice(''); setName(filename); setMode('image');
    let bitmap: ImageBitmap | null = null;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
      if (blob.size > 10 * 1024 * 1024) throw new Error('This image is too large. Choose one smaller than 10 MB.');
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }); if (id !== generation.current) return;
      if (bitmap.width * bitmap.height > 25000000) throw new Error('Choose an image smaller than 25 megapixels.');
      const prepared = makeFrame(bitmap, bitmap.width, bitmap.height); frame.current = prepared;
      if (canvas.current) drawPose(canvas.current, prepared, null, { ...display, mirror: false });
      await new Promise(resolve => requestAnimationFrame(resolve));
      const output = await estimate(prepared, activeEngine, controller.signal); if (id !== generation.current) return;
      setResult(output); setStage('ready');
    } catch (err) { if (id !== generation.current) return; setError(errorText(err)); setStage(frame.current ? 'ready' : 'idle'); }
    finally { bitmap?.close(); }
  }
  async function sample() { setError(''); try { const response = await fetch('/samples/pose.jpg'); if (!response.ok) throw new Error('The sample could not be loaded. Try uploading a photo.'); await analyzeBlob(await response.blob(), 'Sample · Warrior pose'); } catch (err) { setError(errorText(err)); } }
  async function startCamera() {
    stopCamera(); const id = generation.current; setStage('loading'); setError(''); setNotice(''); setResult(null); frame.current = null; setName('Live camera');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      if (id !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media; const element = video.current!; element.srcObject = media; await element.play(); if (id !== generation.current) return;
      running.current = true; setStage('camera'); const controller = new AbortController(); abort.current = controller;
      const tick = async () => {
        if (!running.current || id !== generation.current) return;
        const started = performance.now();
        try {
          if (element.readyState >= 2 && element.videoWidth > 0) {
            const captured = makeFrame(element, element.videoWidth, element.videoHeight, 960);
            const output = await estimate(captured, activeEngine, controller.signal);
            if (!running.current || id !== generation.current) return;
            frame.current = captured; setResult(output);
          }
          if (running.current && id === generation.current) timer.current = setTimeout(tick, Math.max(0, 200 - (performance.now() - started)));
        } catch (err) { if (id !== generation.current) return; stopCamera(); setStage(frame.current ? 'ready' : 'idle'); setError(errorText(err)); }
      }; void tick();
    } catch (err) {
      if (id !== generation.current) return; stopCamera(); setStage('idle');
      const e = err as DOMException; setError(e.name === 'NotAllowedError' ? 'Camera access was denied. Allow camera access in your browser, then try again.' : e.name === 'NotFoundError' ? 'No camera was found. Connect a camera or upload a photo.' : e.name === 'NotReadableError' ? 'The camera is unavailable. Close other apps using it and try again.' : errorText(err));
    }
  }
  function pauseCamera() { stopCamera(); setStage(frame.current ? 'ready' : 'idle'); setNotice('Camera stopped. You can save this frame.'); }
  function saveImage() { canvas.current?.toBlob(blob => { if (blob) { download(blob, 'pose-studio.png'); setNotice('Image downloaded.'); } else setError('The image could not be downloaded.'); }, 'image/png'); }
  function saveData() { if (!result) return; download(new Blob([JSON.stringify({ ...result, landmark_names: NAMES, coordinate_system: 'Normalized original image coordinates; display mirroring does not change data.' }, null, 2)], { type: 'application/json' }), 'pose-studio.json'); setNotice('Pose data downloaded.'); }
  const status = busy ? 'Preparing…' : stage === 'camera' && !result ? 'Finding a pose…' : result ? result.detected ? 'Pose detected' : 'No person detected' : 'Ready when you are';
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Pose Studio home"><span className="brand-mark"><ScanLine size={22}/></span><span>pose<span className="brand-light">studio</span><sup>CV</sup></span></a><div className="header-right"><span className="privacy"><ShieldCheck size={15}/>{activeEngine === 'browser' ? 'Processed on your device' : 'Connected to your server'}</span><button className="icon-button" onClick={() => setHelp(true)} aria-label="How to use Pose Studio"><CircleHelp size={20}/></button></div></header>
    <main>
      <div className="intro"><div><div className="eyebrow"><span/> HUMAN POSE ESTIMATION</div><h1>Movement, <span>mapped.</span></h1><p>Turn a photo or camera feed into a view of the body in motion.</p></div><div className="model-tag"><Activity size={17}/><div>Single-person detection<small>33 body landmarks</small></div></div></div>
      <div className="workspace">
        <section className="viewer-card" aria-label="Pose workspace">
          <div className="viewer-toolbar"><div className="tabs" role="tablist" aria-label="Input type"><button role="tab" aria-selected={mode === 'image'} onClick={() => reset('image')} className={mode === 'image' ? 'selected' : ''}><ImagePlus size={16}/> Image</button><button role="tab" aria-selected={mode === 'camera'} onClick={() => reset('camera')} className={mode === 'camera' ? 'selected' : ''}><Camera size={16}/> Live camera</button></div><button onClick={() => reset()} className="icon-button" aria-label="Reset workspace" title="Reset"><RotateCcw size={16}/></button></div>
          <div className={`preview ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy && stage !== 'camera') setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy && stage !== 'camera' && e.dataTransfer.files[0]) void analyzeBlob(e.dataTransfer.files[0], e.dataTransfer.files[0].name); }}>
            <div className="preview-corner top-left"/><div className="preview-corner bottom-right"/>
            <canvas ref={canvas} className={frame.current ? 'pose-canvas' : 'pose-canvas hidden'} aria-label="Image with estimated body landmarks"/>
            {!frame.current && !busy && stage !== 'camera' && <div className="empty-state"><div className="upload-symbol">{mode === 'image' ? <ScanLine size={35} strokeWidth={1.3}/> : <Camera size={35} strokeWidth={1.3}/>}</div><h2>{mode === 'image' ? 'A new perspective on your pose' : 'See your movement take shape'}</h2><p>{mode === 'image' ? 'Drop a photo here, or choose one to get started.' : 'Step back so your whole body is visible in the camera.'}</p><button className="primary-button" disabled={backend === null} onClick={() => mode === 'image' ? file.current?.click() : void startCamera()}>{mode === 'image' ? <Upload size={17}/> : <Camera size={17}/>} {mode === 'image' ? 'Choose an image' : 'Start camera'}</button><small>{mode === 'image' ? 'JPG, PNG or WebP · up to 10 MB' : 'Camera permission required · audio stays off'}</small></div>}
            {(busy || (stage === 'camera' && !result)) && <div className="loading-overlay"><LoaderCircle className="spin" size={30}/><strong>{mode === 'camera' ? 'Preparing your camera' : 'Finding the landmarks'}</strong><span>The first analysis takes a moment to load.</span>{mode === 'camera' && <button className="secondary-button" onClick={pauseCamera}>Cancel</button>}</div>}
            {result && <div className={`canvas-status ${result.detected ? '' : 'not-found'}`}><span/>{result.detected ? 'POSE DETECTED' : 'NO PERSON DETECTED'}</div>}
            {result && !result.detected && <div className="no-pose-tip">Try a brighter photo with one person’s full body visible.</div>}
          </div>
          <div className="viewer-footer"><span className="source-label">{stage === 'camera' ? <span className="live-dot"/> : <ImagePlus size={15}/>}<span>{name || (mode === 'image' ? 'Your image will appear here' : 'Your camera is off')}</span></span><span>{result ? `${result.width} × ${result.height}` : 'PREVIEW'}</span></div>
          {mode === 'camera' && <div className="camera-controls"><button className={stage === 'camera' ? 'stop-button' : 'primary-button'} disabled={busy || backend === null} onClick={() => stage === 'camera' ? pauseCamera() : void startCamera()}>{stage === 'camera' ? <Pause size={16}/> : <Play size={16}/>} {stage === 'camera' ? 'Stop camera' : 'Start camera'}</button><label className="check-label"><input type="checkbox" checked={display.mirror} onChange={e => setDisplay(d => ({ ...d, mirror: e.target.checked }))}/> Mirror preview</label></div>}
        </section>
        <aside className="controls">
          <section className="panel"><div className="panel-title"><SlidersHorizontal size={17}/><h2>Display controls</h2></div><p className="panel-note">Make the details yours.</p>
            {([['skeleton','Skeleton connections','Trace the body’s structure'],['points','Landmark points','Mark each visible joint'],['labels','Landmark numbers','Match points to exported data']] as const).map(([key, label, hint]) => <label className="switch-row" key={key}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" role="switch" checked={display[key]} onChange={e => setDisplay(d => ({ ...d, [key]: e.target.checked }))}/></label>)}
            <div className="threshold"><div><label htmlFor="visibility">Visibility threshold</label><output htmlFor="visibility">{Math.round(display.threshold * 100)}%</output></div><input id="visibility" type="range" min="10" max="95" step="5" value={display.threshold * 100} onChange={e => setDisplay(d => ({ ...d, threshold: +e.target.value / 100 }))}/><p>Hide points the model is less sure are visible.</p></div>
          </section>
          <section className="panel engine-panel"><div className="panel-title"><Zap size={17}/><h2>Processing</h2></div><label htmlFor="engine" className="sr-only">Processing engine</label><div className="select-wrap"><select id="engine" disabled={busy || stage === 'camera' || backend === null} value={engine} onChange={e => { setEngine(e.target.value as Engine); setNotice('Processing mode applies to your next analysis.'); }}><option value="auto">Automatic</option><option value="browser">On this device</option><option value="server" disabled={!backend}>Python server{!backend ? ' · unavailable' : ''}</option></select><ChevronDown size={16}/></div><p><span className={`engine-dot ${backend === null ? 'pending' : ''}`}/>{backend === null ? 'Checking availability…' : activeEngine === 'server' ? 'Python server ready' : 'Browser processing ready'}</p></section>
          <button className="download-button" disabled={!result || busy} onClick={saveImage}><ArrowDownToLine size={17}/> Download image</button><button className="data-button" disabled={!result || busy} onClick={() => setDataOpen(true)}><Code2 size={16}/> View pose data <ArrowRight size={15}/></button>
        </aside>
      </div>
      {error && <div className="message error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={17}/></button></div>}
      {notice && <div className="message notice" role="status"><Check size={16}/><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={17}/></button></div>}
      <div className="metrics"><div className="metric"><span className="metric-icon"><Crosshair size={20}/></span><div><span className="metric-label">VISIBLE LANDMARKS</span><div className="metric-value">{result ? detectedCount : '—'}<small>/ 33</small></div></div><span className="metric-end">At your threshold</span></div><div className="metric"><span className="metric-icon"><Activity size={20}/></span><div><span className="metric-label">AVERAGE VISIBILITY</span><div className="metric-value">{averageVisibility ?? '—'}<small>{averageVisibility !== null ? '%' : ''}</small></div></div><span className="metric-end">Model estimate</span></div><div className="metric"><span className="metric-icon"><Zap size={20}/></span><div><span className="metric-label">PROCESSING TIME</span><div className="metric-value">{result?.processing_ms ?? '—'}<small>ms</small></div></div><span className="metric-end">{result ? result.engine === 'server' ? 'Python server' : 'On this device' : 'Per frame'}</span></div></div>
      <section className="sample-strip"><div className="sample-image"><img src="/samples/pose.jpg" alt="Sample of a person holding a standing yoga pose"/></div><div><h2>Try a pose, see the possibilities.</h2><p>Explore the sample before adding your own image.</p></div><button className="secondary-button" disabled={busy || stage === 'camera' || backend === null} onClick={() => void sample()}>Try sample <ArrowRight size={16}/></button></section>
      <footer><span>POSE STUDIO <span className="footer-divider">/</span> Built to explore movement</span><button onClick={() => setHelp(true)}>A few tips for better results <ArrowRight size={14}/></button></footer>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </main>
    <input ref={file} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload pose image" onChange={e => { const image = e.target.files?.[0]; if (image) void analyzeBlob(image, image.name); e.target.value = ''; }}/>
    <video ref={video} className="capture-video" muted playsInline aria-hidden="true"/>
    <dialog ref={helpDialog} onCancel={() => setHelp(false)} onClick={e => { if (e.target === e.currentTarget) setHelp(false); }}><div className="dialog-top"><h2>A better view of your pose</h2><button className="icon-button" onClick={() => setHelp(false)} aria-label="Close help"><X/></button></div><div className="help-content"><p>Choose a photo or start your camera. Pose Studio finds one person and draws their body landmarks.</p><ol><li>Keep your whole body in the frame, including your hands and feet.</li><li>Use even lighting and avoid covering one limb with another.</li><li>Adjust the visibility threshold to show fewer uncertain points.</li><li>Stop the camera to save a frame, or download an image at any time.</li></ol><p>Browser mode processes images on your device. Server mode sends frames to your connected Python backend, which processes them without saving them.</p><p className="muted">These are estimated landmarks, not medical or fitness assessments.</p></div></dialog>
    <dialog ref={dataDialog} className="data-dialog" onCancel={() => setDataOpen(false)} onClick={e => { if (e.target === e.currentTarget) setDataOpen(false); }}><div className="dialog-top"><div><h2>Pose data</h2><p>Coordinates use the original image, before display mirroring.</p></div><button className="icon-button" onClick={() => setDataOpen(false)} aria-label="Close pose data"><X/></button></div><div className="table-wrap"><table><thead><tr><th>Landmark</th><th>X</th><th>Y</th><th>Visibility</th></tr></thead><tbody>{result?.landmarks.map((p, i) => <tr key={i}><td><span>{i}</span> {NAMES[i]}</td><td>{p.x.toFixed(3)}</td><td>{p.y.toFixed(3)}</td><td>{Math.round(p.visibility * 100)}%</td></tr>)}</tbody></table>{!result?.detected && <p className="muted">No landmarks were detected in this frame.</p>}</div><button className="primary-button" onClick={saveData}><ArrowDownToLine size={16}/> Download JSON</button></dialog>
  </div>;
}
