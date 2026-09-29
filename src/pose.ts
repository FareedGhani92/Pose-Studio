import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
export type Landmark = { x: number; y: number; z: number; visibility: number };
export type PoseResult = { detected: boolean; landmarks: Landmark[]; processing_ms: number; width: number; height: number; engine: 'browser' | 'server' };
export type Engine = 'auto' | 'browser' | 'server';
export const CONNECTIONS = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],[27,29],[28,30],[29,31],[30,32],[27,31],[28,32]];
export const NAMES = ['Nose','Left eye inner','Left eye','Left eye outer','Right eye inner','Right eye','Right eye outer','Left ear','Right ear','Mouth left','Mouth right','Left shoulder','Right shoulder','Left elbow','Right elbow','Left wrist','Right wrist','Left pinky','Right pinky','Left index','Right index','Left thumb','Right thumb','Left hip','Right hip','Left knee','Right knee','Left ankle','Right ankle','Left heel','Right heel','Left foot','Right foot'];
let modelPromise: Promise<PoseLandmarker> | null = null;
async function getModel() {
  if (!modelPromise) modelPromise = FilesetResolver.forVisionTasks('/wasm').then(files => PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
    runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5,
  })).catch(error => { modelPromise = null; throw error; });
  return modelPromise;
}
export async function hasBackend() {
  try { const response = await fetch('/api/health', { signal: AbortSignal.timeout(2500) }); if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false; const body = await response.json(); return body.status === 'ok' && body.model_ready === true; } catch { return false; }
}
export async function estimate(frame: HTMLCanvasElement, engine: 'browser' | 'server', signal?: AbortSignal): Promise<PoseResult> {
  if (engine === 'server') {
    const blob = await new Promise<Blob>((resolve, reject) => frame.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare this image.')), 'image/jpeg', .9));
    const body = new FormData(); body.append('file', blob, 'frame.jpg');
    const response = await fetch('/api/pose', { method: 'POST', body, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(typeof error.detail === 'string' ? error.detail : 'The server could not process this image.'); }
    return { ...await response.json(), engine: 'server' };
  }
  const model = await getModel(); signal?.throwIfAborted();
  const inferenceStart = performance.now();
  const result = model.detect(frame); const landmarks = (result.landmarks[0] ?? []).map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
  return { detected: landmarks.length > 0, landmarks, processing_ms: Math.round(performance.now() - inferenceStart), width: frame.width, height: frame.height, engine: 'browser' };
}
export function makeFrame(source: CanvasImageSource, width: number, height: number, maxSize = 1280) {
  const ratio = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser could not create an image preview.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height); return canvas;
}
export type Display = { skeleton: boolean; points: boolean; labels: boolean; threshold: number; mirror: boolean };
export function drawPose(canvas: HTMLCanvasElement, frame: HTMLCanvasElement, result: PoseResult | null, display: Display) {
  canvas.width = frame.width; canvas.height = frame.height; const ctx = canvas.getContext('2d')!;
  ctx.save(); if (display.mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); } ctx.drawImage(frame, 0, 0); ctx.restore();
  if (!result?.detected) return;
  const landmarks = result.landmarks; const point = (i: number) => ({ x: (display.mirror ? 1 - landmarks[i].x : landmarks[i].x) * canvas.width, y: landmarks[i].y * canvas.height });
  const visible = (i: number) => landmarks[i] && landmarks[i].visibility >= display.threshold;
  const unit = Math.max(1, canvas.width / 650);
  ctx.lineCap = 'round';
  if (display.skeleton) CONNECTIONS.forEach(([a, b]) => {
    if (!visible(a) || !visible(b)) return; const p = point(a), q = point(b);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.lineWidth = 4 * unit; ctx.strokeStyle = '#0b183888'; ctx.stroke();
    ctx.lineWidth = 2 * unit; ctx.strokeStyle = a % 2 ? '#96f6d1' : '#aab8ff'; ctx.stroke();
  });
  landmarks.forEach((_, i) => { if (!visible(i)) return; const p = point(i);
    if (display.points) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * unit, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = unit; ctx.strokeStyle = '#5146db'; ctx.stroke(); }
    if (display.labels) { ctx.font = `600 ${11 * unit}px sans-serif`; const text = String(i); ctx.fillStyle = '#10152cdd'; ctx.fillRect(p.x + 5 * unit, p.y - 17 * unit, ctx.measureText(text).width + 7 * unit, 15 * unit); ctx.fillStyle = '#fff'; ctx.fillText(text, p.x + 8 * unit, p.y - 6 * unit); }
  });
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
