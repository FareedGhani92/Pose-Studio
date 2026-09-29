"""FastAPI inference server and production frontend host."""
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from threading import Lock
import os
import time
import warnings

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from starlette.formparsers import MultiPartParser
from backend.vendor.mp_persondet import MPPersonDet
from backend.vendor.mp_pose import MPPose

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(os.environ.get("POSE_MODEL_DIR", ROOT / "backend/models"))
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1024 * 1024
MAX_PIXELS = 25_000_000
# All request bodies are bounded before multipart parsing. Keep uploads in memory.
MultiPartParser.spool_max_size = MAX_REQUEST_BYTES
MultiPartParser.max_file_size = MAX_REQUEST_BYTES
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != "/api/pose":
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_REQUEST_BYTES:
                response = JSONResponse({"detail": "Choose an image smaller than 10 MB."}, status_code=413)
                return await response(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        consumed = False
        async def replay():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        return await self.app(scope, replay, send)

class Landmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: float

class PoseResponse(BaseModel):
    detected: bool
    landmarks: list[Landmark]
    processing_ms: int
    width: int
    height: int
    engine: str = "server"

class PoseService:
    def __init__(self):
        self.lock = Lock()
        # OpenCV's ONNX versions of MediaPipe's detector and landmark model
        # run entirely on the CPU, including on headless Mac/Linux servers.
        self.detector = MPPersonDet(str(MODEL_DIR / "person_detection_mediapipe_2023mar.onnx"), backendId=cv2.dnn.DNN_BACKEND_OPENCV, targetId=cv2.dnn.DNN_TARGET_CPU)
        self.model = MPPose(str(MODEL_DIR / "pose_estimation_mediapipe_2023mar.onnx"), backendId=cv2.dnn.DNN_BACKEND_OPENCV, targetId=cv2.dnn.DNN_TARGET_CPU)

    def predict(self, data: bytes):
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(data)) as image:
                    if image.format not in {"JPEG", "PNG", "WEBP"}:
                        raise HTTPException(415, "Choose a JPG, PNG, or WebP image.")
                    if image.width * image.height > MAX_PIXELS:
                        raise HTTPException(413, "Choose an image smaller than 25 megapixels.")
                    rgb = np.asarray(ImageOps.exif_transpose(image).convert("RGB"))
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(413, "Choose an image smaller than 25 megapixels.")
        except (UnidentifiedImageError, OSError, ValueError):
            raise HTTPException(400, "This file is not a readable image.")
        height, width = rgb.shape[:2]
        ratio = min(1.0, 1280 / max(width, height))
        if ratio < 1:
            rgb = cv2.resize(rgb, (max(1, round(width * ratio)), max(1, round(height * ratio))), interpolation=cv2.INTER_AREA)
        height, width = rgb.shape[:2]
        if not self.lock.acquire(blocking=False):
            raise HTTPException(503, "The pose model is busy. Please try again shortly.")
        try:
            started = time.perf_counter()
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            people = self.detector.infer(bgr)
            output = None
            if len(people):
                person = people[np.argmax(people[:, -1])].copy()
                # Reject degenerate detections before crop allocation.
                radius = np.linalg.norm(person[4:6] - person[6:8])
                if 2 < radius < max(width, height) * 2:
                    output = self.model.infer(bgr, person)
            elapsed = round((time.perf_counter() - started) * 1000)
        finally:
            self.lock.release()
        landmarks = [] if output is None else [Landmark(x=float(p[0] / width), y=float(p[1] / height), z=float(p[2] / width), visibility=float(p[3])) for p in output[1][:33]]
        return PoseResponse(detected=bool(landmarks), landmarks=landmarks, processing_ms=elapsed, width=width, height=height)

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pose_service = await run_in_threadpool(PoseService)
    yield
    del app.state.pose_service

app = FastAPI(title="Pose Studio API", version="1.0.0", lifespan=lifespan)
app.add_middleware(BodyLimitMiddleware)

@app.get("/api/health")
async def health():
    return {"status": "ok", "model_ready": hasattr(app.state, "pose_service"), "model": "MediaPipe BlazePose / OpenCV CPU", "max_upload_mb": 10}

@app.post("/api/pose", response_model=PoseResponse)
async def pose(file: UploadFile = File(...)):
    try:
        if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(415, "Choose a JPG, PNG, or WebP image.")
        data = await file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(413, "Choose an image smaller than 10 MB.")
        if not data:
            raise HTTPException(400, "The uploaded image is empty.")
        return await run_in_threadpool(app.state.pose_service.predict, data)
    finally:
        await file.close()

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def unknown_api(path: str):
    raise HTTPException(404, "API endpoint not found.")

if (ROOT / "dist").is_dir() and not os.environ.get("VERCEL"):
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
