# Pose Studio

A complete, single-person pose estimation app. Upload a photo or use a camera to see a skeleton overlay, inspect 33 body landmarks, and export annotated PNG images or JSON data.

## Start the complete app

1. Unzip the project.
2. Install **Python 3.10–3.13** if it is not already available.
3. Open a terminal in the `pose-studio` folder and run:

```sh
python3 start.py
```

On Windows, use `py start.py`. The launcher prepares an isolated Python environment, installs the backend dependencies on the first run, verifies the included models, and opens the app at **http://127.0.0.1:8000**. The complete ZIP includes the built frontend, so Node.js is not needed just to run it. Internet access is needed for the first dependency installation.

Keep the terminal open. Press Ctrl+C to stop. If port 8000 is occupied, run `python3 start.py --port 8001`. Use `--no-browser` to skip opening a browser.

## Features

- JPG, PNG, and WebP uploads, including drag-and-drop; 10 MB maximum.
- Camera start/stop with no audio capture, automatic cleanup when the page is hidden, and a mirrored preview option.
- Skeleton, landmark points, landmark numbers, and adjustable visibility threshold.
- Real landmark count, average visibility, and model processing time.
- PNG download and a landmark table with JSON export.
- A bundled sample photo, readable errors, keyboard controls, and responsive layouts.
- Two real inference engines with the same normalized landmark response format.

## Frontend and backend

The frontend is **React + TypeScript + Vite**. Browser mode uses MediaPipe Pose Landmarker Lite with model and WebAssembly files served from the app itself. Images and camera frames remain on the device in this mode.

The backend is **Python + FastAPI + OpenCV**. It runs OpenCV Zoo's ONNX conversions of the MediaPipe person detector and BlazePose landmark estimator on the CPU. This avoids the graphics-context dependency of the native MediaPipe Python package on headless Macs. Server mode sends frames to the backend; bounded requests and images are processed in memory without persistent storage.

Automatic mode selects the same-origin Python backend when its health check succeeds, otherwise the browser engine. Results can differ slightly between engines because they use different model versions and preprocessing implementations.

```text
Photo or captured frame
  → validation and resizing
  → Python CPU model OR browser MediaPipe model
  → 33 normalized landmarks
  → skeleton overlay, metrics, PNG / JSON exports
```

The webcam processes at most about five frames per second, with one in-flight request at a time. Each result is drawn on its corresponding captured frame. Actual speed depends on hardware. Longest image side is limited to 1280 pixels; camera frames are limited to 960 pixels.

## Develop the project

Use Node.js 22+ and pnpm 11.19.0 for frontend development:

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5178**. The development server forwards `/api` requests to port 8000. The browser-only mode works even when the Python server is not running.

In another terminal, start the Python backend:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

On Windows, activate with `.venv\Scripts\activate` instead. Rebuild frontend changes with `pnpm build` before using the single-server launcher.

## API

Interactive documentation: **http://127.0.0.1:8000/docs**.

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Backend and model readiness |
| `POST /api/pose` | Multipart image upload in the `file` field |

```sh
curl -F 'file=@public/samples/pose.jpg' http://127.0.0.1:8000/api/pose
```

The response contains `detected`, `landmarks`, `processing_ms`, `width`, `height`, and `engine`. Each landmark has `x`, `y`, `z`, and `visibility`. X/Y are normalized to image dimensions; inferred points outside the frame can be outside 0–1. Z is relative depth, normalized by image width, not a distance measurement. Visibility is a model estimate of how visible a point is, not an accuracy score. Exported coordinates remain in the original image orientation even when the display is mirrored. `processing_ms` measures inference and its model preprocessing, excluding network time.

No person is a valid `200` response with `detected: false` and an empty landmark list. Invalid, unsupported, oversized, missing, and concurrent-busy inputs return meaningful 400/415/413/422/503 errors respectively.

## Tests

```sh
python -m pip install -r backend/requirements-dev.txt
python -m pytest -q tests/test_api.py
pnpm build
```

The API suite exercises real model inference, blank images, corrupt/unsupported/oversized files, missing uploads, request limits, EXIF rotation/resizing, and unknown API routes. Tests do not replace the model with fake detections.

For camera testing without a physical webcam, run the development server and open **http://127.0.0.1:5178/__test__/camera**. This uses a clearly labelled synthetic video stream made from the sample photo. Select Live camera, start, and stop; the badge reports the active track count. Add `?deny=1` to test permission-denied handling. This fixture is injected only during development and is absent from the production build.

The app optionally registers `get_pose_result` and `reset_pose_workspace` through WebMCP when the browser supports that API. Ordinary controls do not depend on WebMCP.

## Deployment

**Vercel:** the project includes a Vite frontend and FastAPI function configuration. Import the `pose-studio` folder as a Vercel project, keep the root directory set to this folder, and deploy. Vercel serves `dist/` and routes `/api/*` to the Python API; the ONNX models are included with that function. Python dependencies are listed in the root `requirements.txt`. The app uses browser inference if the API is unavailable. Vercel Functions cap request bodies at 4.5 MB; the app scales uploaded images before API inference, and very large originals should use browser mode.

**Full frontend + Python backend:** use the supplied Dockerfile on a Python/container-capable host:

```sh
docker build -t pose-studio .
docker run --rm -p 8000:8000 pose-studio
```

Use HTTPS on a hosted deployment so camera access works. The container respects the `PORT` environment variable. The image is designed for a small demonstration deployment; add authentication, request rate limits, and worker scaling before serving a large public audience. Docker requires a container runtime and is a separate deployment option from the tested local launcher.

**Browser-only hosting:** run `pnpm build` and serve `dist/` as static files. This version performs actual pose inference in the browser; it does not run the Python backend. Camera access works on HTTPS or localhost, subject to browser permission. Some embedded browsers restrict cameras or downloads; use a current Chrome, Edge, Safari, or Firefox browser if needed.

## Project layout

```text
src/                  React interface, overlay rendering, browser inference
backend/main.py       FastAPI endpoints, validation, CPU inference
backend/vendor/       Apache-licensed OpenCV Zoo model wrappers
backend/models/       Bundled ONNX models
public/models/        Bundled browser pose model
public/samples/       Sample image
scripts/              Model verification and browser asset preparation
tests/                Real API tests and development camera fixture
dist/                 Built frontend in the complete ZIP
start.py              First-run setup and local launcher
Dockerfile            Full-stack container deployment
```

Model checksums and original URLs are recorded in `scripts/models.json`. Run `python scripts/download_model.py` to verify or restore missing models. Credits and third-party licenses are in `THIRD_PARTY.md` and `backend/vendor/LICENSE`.
