from io import BytesIO
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app, MAX_FILE_BYTES, MAX_REQUEST_BYTES

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as client:
        yield client

def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["model_ready"] is True

def test_real_pose_inference(client):
    sample = Path(__file__).resolve().parents[1] / "public/samples/pose.jpg"
    response = client.post("/api/pose", files={"file": ("pose.jpg", sample.read_bytes(), "image/jpeg")})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["detected"] is True
    assert len(result["landmarks"]) == 33
    assert result["width"] == 1000 and result["height"] == 667
    assert all(0 <= p["visibility"] <= 1 for p in result["landmarks"])

def test_no_person(client):
    buffer = BytesIO()
    Image.new("RGB", (320, 240), "white").save(buffer, format="PNG")
    result = client.post("/api/pose", files={"file": ("blank.png", buffer.getvalue(), "image/png")})
    assert result.status_code == 200
    assert result.json()["detected"] is False
    assert result.json()["landmarks"] == []

@pytest.mark.parametrize("content,mime,expected", [(b"", "image/jpeg", 400), (b"not an image", "image/jpeg", 400), (b"text", "text/plain", 415), (b"0" * (MAX_FILE_BYTES + 1), "image/jpeg", 413)], ids=["empty", "corrupt", "unsupported", "oversized"])
def test_invalid_uploads(client, content, mime, expected):
    response = client.post("/api/pose", files={"file": ("input", content, mime)})
    assert response.status_code == expected
    assert isinstance(response.json()["detail"], str)

def test_request_size_limit(client):
    response = client.post("/api/pose", content=b"x" * (MAX_REQUEST_BYTES + 1), headers={"content-type": "application/octet-stream"})
    assert response.status_code == 413

def test_missing_file(client):
    assert client.post("/api/pose").status_code == 422

def test_unknown_api_is_not_html(client):
    response = client.get("/api/missing")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")

def test_exif_orientation_and_resize(client):
    image = Image.new("RGB", (1600, 800), "white")
    exif = image.getexif(); exif[274] = 6
    buffer = BytesIO(); image.save(buffer, format="JPEG", exif=exif)
    response = client.post("/api/pose", files={"file": ("rotated.jpg", buffer.getvalue(), "image/jpeg")})
    assert response.status_code == 200
    assert (response.json()["width"], response.json()["height"]) == (640, 1280)
