/* Development-only synthetic camera. Never loaded by the production build. */
(() => {
  const image = new Image(); image.src = '/samples/pose.jpg';
  const ready = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 534;
  const ctx = canvas.getContext('2d');
  let activeStream = null;
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
    if (new URLSearchParams(location.search).has('deny')) throw new DOMException('Simulated camera denial', 'NotAllowedError');
    await ready;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    activeStream = canvas.captureStream(5);
    return activeStream;
  }});
  const install = () => {
    const badge = document.createElement('output'); badge.id = 'camera-test-status';
    badge.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:100;background:#111;color:#fff;padding:8px;font:12px monospace';
    document.body.append(badge);
    setInterval(() => {
      if (image.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const count = activeStream?.getTracks().filter(t => t.readyState === 'live').length ?? 0;
      badge.textContent = `TEST CAMERA · synthetic frames · ${count} active track(s)`;
    }, 200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
