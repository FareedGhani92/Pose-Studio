# Verification record

Verified locally on macOS / Apple Silicon, September 28–29, 2026.

- Production frontend: TypeScript checking and Vite build passed.
- Backend: 11 tests passed using Python 3.13, NumPy 2.2.6, and OpenCV 4.11 in a fresh environment matching the delivered requirements.
- Real inference: sample photo returns 33 landmarks through both the browser model and the Python API.
- Full-stack UI: automatic backend discovery, image inference, and the 33-row landmark table verified in the browser.
- Image upload: a blank PNG was selected through the file picker and correctly produced “No person detected.”
- Camera: synthetic video frames ran through the real Python model; Stop released all capture tracks. Simulated permission denial displayed the expected error. No personal webcam was accessed.
- Exports: PNG and JSON controls were exercised and the app's export feedback appeared. The embedded browser's download-event observer did not return a saved-file path, so receipt of the files on disk was not independently verified.
- Responsive layout: desktop and narrow mobile layouts inspected; 390px viewport had no horizontal overflow.
- WebMCP: result read and reset verified; invalid arguments rejected without changing the result.
- Launcher: first-run environment creation and installation completed; the resulting server served the built frontend and a healthy API on port 8001.
- Model checksum validation passed for all bundled models.

Not verified: a physical webcam, other operating systems/browser families, and Docker image execution. Docker instructions are included as a deployment option.

Online publication is pending approval for a temporary source-repository write credential. The local app and ZIP do not depend on publication.
