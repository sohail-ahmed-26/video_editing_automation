"""
Photo Analyzer
Performs local, fast image analysis using OpenCV and Pillow:
- Dimensions and aspect ratio
- Average brightness (0-255)
- Contrast (standard deviation of grayscale values)
- Blur score (Laplacian variance)
- Face detection (Haar cascade) and saliency center for smart cropping
"""

import os
import cv2
import numpy as np
from PIL import Image, ImageOps
from typing import Dict, Any, Tuple

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass


def load_normalized_image(image_path: str) -> Image.Image:
    """Loads an image with Pillow and normalizes EXIF orientation."""
    im = Image.open(image_path)
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    return im


def detect_faces(cv_gray: np.ndarray) -> list:
    """Detects frontal faces using OpenCV's built-in Haar Cascade classifier."""
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    if not os.path.exists(cascade_path):
        return []

    face_cascade = cv2.CascadeClassifier(cascade_path)
    faces = face_cascade.detectMultiScale(
        cv_gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(30, 30)
    )
    return [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in faces]


def calculate_saliency_center(cv_bgr: np.ndarray, faces: list) -> Tuple[float, float]:
    """
    Finds the normalized focal center (center_x, center_y in [0, 1]) for smart cropping.
    Prioritizes face positions; falls back to edge-density / saliency; falls back to (0.5, 0.5).
    """
    h, w = cv_bgr.shape[:2]
    if h == 0 or w == 0:
        return 0.5, 0.5

    # If faces were detected, focal point is the center of the largest face
    if faces:
        largest_face = max(faces, key=lambda f: f["w"] * f["h"])
        fx = (largest_face["x"] + largest_face["w"] / 2.0) / float(w)
        fy = (largest_face["y"] + largest_face["h"] / 2.0) / float(h)
        return float(np.clip(fx, 0.1, 0.9)), float(np.clip(fy, 0.1, 0.9))

    # Fallback to edge / gradient density center
    gray = cv2.cvtColor(cv_bgr, cv2.COLOR_BGR2GRAY)
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(sobelx, sobely)

    total_mag = float(np.sum(magnitude))
    if total_mag > 1e-4:
        # Calculate center of mass of edge energy
        y_indices, x_indices = np.indices(magnitude.shape)
        cx = float(np.sum(x_indices * magnitude) / total_mag) / float(w)
        cy = float(np.sum(y_indices * magnitude) / total_mag) / float(h)
        return float(np.clip(cx, 0.15, 0.85)), float(np.clip(cy, 0.15, 0.85))

    return 0.5, 0.5


def analyze_photo(image_path: str) -> Dict[str, Any]:
    """
    Analyzes an image and returns structured metadata for AI planning:
    - width, height, aspect_ratio
    - brightness, contrast, blur_score
    - faces (count and bounding boxes)
    - saliency_center (normalized cx, cy)
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found at {image_path}")

    pil_img = load_normalized_image(image_path)
    w, h = pil_img.size

    # Convert to OpenCV RGB / BGR and Grayscale
    np_img = np.array(pil_img)
    if len(np_img.shape) == 2:
        cv_gray = np_img
        cv_bgr = cv2.cvtColor(np_img, cv2.COLOR_GRAY2BGR)
    elif np_img.shape[2] == 4:
        cv_bgr = cv2.cvtColor(np_img, cv2.COLOR_RGBA2BGR)
        cv_gray = cv2.cvtColor(cv_bgr, cv2.COLOR_BGR2GRAY)
    else:
        cv_bgr = cv2.cvtColor(np_img, cv2.COLOR_RGB2BGR)
        cv_gray = cv2.cvtColor(cv_bgr, cv2.COLOR_BGR2GRAY)

    # 1. Average Brightness (0-255)
    mean_val = float(np.mean(cv_gray))

    # 2. Contrast (standard deviation, typically 10-80)
    std_val = float(np.std(cv_gray))

    # 3. Blur Score (Laplacian variance: <80 = blurry, >150 = sharp)
    laplacian_var = float(cv2.Laplacian(cv_gray, cv2.CV_64F).var())

    # 4. Face Detection
    faces = detect_faces(cv_gray)

    # 5. Saliency Center for Smart Crop
    cx, cy = calculate_saliency_center(cv_bgr, faces)

    aspect_ratio_val = round(w / float(h), 3)

    return {
        "width": w,
        "height": h,
        "aspect_ratio": aspect_ratio_val,
        "brightness": round(mean_val, 1),
        "contrast": round(std_val, 1),
        "blur_score": round(laplacian_var, 1),
        "is_blurry": laplacian_var < 75.0,
        "is_dark": mean_val < 70.0,
        "is_overexposed": mean_val > 200.0,
        "face_count": len(faces),
        "faces": faces,
        "saliency_center": {
            "x": round(cx, 3),
            "y": round(cy, 3)
        }
    }

