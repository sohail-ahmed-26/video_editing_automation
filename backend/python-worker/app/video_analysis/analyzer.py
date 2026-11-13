"""
Video and Audio Analysis Engine
Local, offline, free analysis using OpenCV, NumPy, SciPy, and FFmpeg:
- Per-second sharpness (Laplacian variance), motion energy, exposure, shakiness
- Face presence, face size, and subject focal center
- Composite "best moment" score for hook selection and shot prioritization
- Bad shot detection (blurry, violent jitter, underexposed/blown out)
- Near-duplicate shot detection via HSV histogram correlation
- Audio beat onset detection for rhythm-aligned video cuts
- Loudness and clipping analysis
"""

import os
import sys
import shutil
import subprocess
import json
import time
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple, Optional

try:
    from scipy.signal import find_peaks
except ImportError:
    find_peaks = None


def detect_skin_or_faces(bgr_frame: np.ndarray) -> Tuple[bool, int, float, Tuple[float, float]]:
    """
    Detects faces or prominent human subjects using skin-tone color filtering & contour saliency.
    Works offline with zero external network downloads.
    Returns: (face_detected, count, size_ratio, (center_x, center_y))
    """
    h, w = bgr_frame.shape[:2]
    if h == 0 or w == 0:
        return False, 0, 0.0, (0.5, 0.5)

    # 1. Try Haar Cascade if available in cv2 or models
    cascade_paths = [
        os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml") if hasattr(cv2, 'data') and hasattr(cv2.data, 'haarcascades') else "",
        os.path.join(os.path.dirname(__file__), "haarcascade_frontalface_default.xml"),
    ]
    for cp in cascade_paths:
        if cp and os.path.exists(cp):
            try:
                face_cascade = cv2.CascadeClassifier(cp)
                gray = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(25, 25))
                if len(faces) > 0:
                    largest = max(faces, key=lambda f: f[2] * f[3])
                    lx, ly, lw, lh = largest
                    cx = (lx + lw / 2.0) / float(w)
                    cy = (ly + lh / 2.0) / float(h)
                    size_ratio = float(lw * lh) / float(w * h)
                    return True, len(faces), round(size_ratio, 4), (round(cx, 3), round(cy, 3))
            except Exception:
                pass

    # 2. Robust Skin-Tone & Saliency Analysis (YCrCb color space)
    ycrcb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2YCrCb)
    lower_skin = np.array([0, 133, 77], dtype=np.uint8)
    upper_skin = np.array([255, 173, 127], dtype=np.uint8)
    skin_mask = cv2.inRange(ycrcb, lower_skin, upper_skin)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_OPEN, kernel)
    skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(skin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = (w * h) * 0.01
    valid_blobs = [c for c in contours if cv2.contourArea(c) > min_area]

    if valid_blobs:
        largest = max(valid_blobs, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        x, y, bw, bh = cv2.boundingRect(largest)
        aspect = float(bw) / float(bh) if bh > 0 else 1.0
        if 0.5 < aspect < 2.2:
            cx = (x + bw / 2.0) / float(w)
            cy = (y + bh / 2.0) / float(h)
            size_ratio = area / float(w * h)
            return True, len(valid_blobs), round(size_ratio, 4), (round(cx, 3), round(cy, 3))

    # 3. Fallback: Edge Saliency Center (where the detail/action is located)
    gray = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    moments = cv2.moments(edges)
    if moments["m00"] > 0:
        cx = (moments["m10"] / moments["m00"]) / float(w)
        cy = (moments["m01"] / moments["m00"]) / float(h)
        return False, 0, 0.0, (round(cx, 3), round(cy, 3))

    return False, 0, 0.0, (0.5, 0.5)


def get_video_metadata(video_path: str) -> Dict[str, Any]:
    """Retrieves basic stream metadata using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "stream=width,height,r_frame_rate,duration:format=duration",
        "-select_streams", "v:0",
        "-of", "json",
        video_path
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            text=True,
            timeout=10
        )
        data = json.loads(proc.stdout)
        stream = data.get("streams", [{}])[0]
        fmt = data.get("format", {})

        width = int(stream.get("width", 1920))
        height = int(stream.get("height", 1080))
        dur_str = stream.get("duration") or fmt.get("duration") or "10.0"
        duration = float(dur_str)

        fps_str = stream.get("r_frame_rate", "30/1")
        if "/" in fps_str:
            num, den = fps_str.split("/")
            fps = float(num) / float(den) if float(den) > 0 else 30.0
        else:
            fps = float(fps_str)

        return {"width": width, "height": height, "duration": duration, "fps": fps}
    except Exception:
        return {"width": 1920, "height": 1080, "duration": 10.0, "fps": 30.0}


def analyze_video(video_path: str, sample_fps: float = 1.0) -> Dict[str, Any]:
    """
    Performs comprehensive per-clip and per-second video quality & content analysis.
    Uses FFmpeg for fast downscaled frame sampling, then OpenCV for per-frame computer vision.
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    meta = get_video_metadata(video_path)
    width = meta["width"]
    height = meta["height"]
    duration = meta["duration"]
    orig_fps = meta["fps"]

    temp_dir = os.path.join(
        os.path.dirname(os.path.abspath(video_path)),
        f"__analysis_temp_{int(time.time() * 1000)}"
    )
    os.makedirs(temp_dir, exist_ok=True)

    try:
        frame_pattern = os.path.join(temp_dir, "frame_%04d.jpg")
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", f"fps={sample_fps},scale=360:-2",
            "-q:v", "3",
            frame_pattern
        ]
        subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            timeout=40
        )

        frame_files = sorted([f for f in os.listdir(temp_dir) if f.startswith("frame_") and f.endswith(".jpg")])

        second_data: List[Dict[str, Any]] = []
        histograms: List[np.ndarray] = []
        prev_gray: Optional[np.ndarray] = None
        prev_cx, prev_cy = 0.5, 0.5

        for idx, fname in enumerate(frame_files):
            fpath = os.path.join(temp_dir, fname)
            frame = cv2.imread(fpath)
            if frame is None:
                continue

            sec = idx
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            sharp = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            bright = float(np.mean(gray))

            motion_val = 0.0
            shakiness = 0.0
            if prev_gray is not None and prev_gray.shape == gray.shape:
                diff = cv2.absdiff(prev_gray, gray)
                motion_val = float(np.mean(diff))

                try:
                    p1 = prev_gray.astype(np.float32)
                    p2 = gray.astype(np.float32)
                    (shift_x, shift_y), _ = cv2.phaseCorrelate(p1, p2)
                    shakiness = float(shift_x ** 2 + shift_y ** 2)
                except Exception:
                    shakiness = 0.0

            has_f, f_count, f_size, (cx, cy) = detect_skin_or_faces(frame)

            is_too_dark = bright < 35.0
            is_too_bright = bright > 225.0

            is_bad = False
            bad_reason = ""
            if sharp < 12.0:
                is_bad = True
                bad_reason = "blurry"
            elif shakiness > 15.0:
                is_bad = True
                bad_reason = "shaky"
            elif is_too_dark:
                is_bad = True
                bad_reason = "underexposed"
            elif is_too_bright:
                is_bad = True
                bad_reason = "overexposed"

            score_sharp = min(30.0, (sharp / 80.0) * 30.0)
            if 70.0 <= bright <= 180.0:
                score_exp = 25.0
            else:
                diff = min(abs(bright - 125.0), 125.0)
                score_exp = max(5.0, 25.0 - (diff / 125.0) * 20.0)

            score_face = 25.0 if has_f else (15.0 if f_size > 0.04 else 10.0)
            if shakiness > 12.0:
                score_motion = 5.0
            elif motion_val < 1.0:
                score_motion = 8.0
            else:
                score_motion = min(20.0, 10.0 + min(motion_val, 10.0))

            composite_score = score_sharp + score_exp + score_face + score_motion
            if is_bad:
                composite_score = max(5.0, composite_score * 0.4)

            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
            cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
            histograms.append(hist)

            second_data.append({
                "second": sec,
                "sharpness": round(sharp, 2),
                "brightness": round(bright, 1),
                "motion": round(motion_val, 2),
                "shakiness": round(shakiness, 2),
                "is_too_dark": is_too_dark,
                "is_too_bright": is_too_bright,
                "has_face": has_f,
                "face_count": f_count,
                "face_size": round(f_size, 3),
                "subject_center": {"x": round(cx, 3), "y": round(cy, 3)},
                "score": round(composite_score, 1),
                "is_bad_shot": is_bad,
                "bad_reason": bad_reason,
                "is_duplicate": False,
                "duplicate_of": None,
            })

            prev_gray = gray
            prev_cx, prev_cy = cx, cy

        _detect_near_duplicates(second_data, histograms)

        scores = [s["score"] for s in second_data]
        overall_score = float(np.mean(scores)) if scores else 50.0

        best_window = _find_best_window(second_data, window_size=2)

        shakiness_vals = [s["shakiness"] for s in second_data]
        avg_shakiness = float(np.mean(shakiness_vals)) if shakiness_vals else 0.0
        shaky_clip = avg_shakiness > 6.0

        bad_segments = [
            {"start": s["second"], "end": s["second"] + 1, "reason": s["bad_reason"]}
            for s in second_data if s["is_bad_shot"]
        ]

        subject_x_vals = [s["subject_center"]["x"] for s in second_data]
        dominant_subject_x = float(np.median(subject_x_vals)) if subject_x_vals else 0.5

        return {
            "duration": round(duration, 3),
            "fps": round(orig_fps, 2),
            "width": width,
            "height": height,
            "is_vertical": height > width,
            "overall_score": round(overall_score, 1),
            "best_moment": best_window,
            "shaky_clip": shaky_clip,
            "avg_shakiness": round(avg_shakiness, 2),
            "dominant_subject_x": round(dominant_subject_x, 3),
            "bad_segments": bad_segments,
            "seconds": second_data,
        }
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def _detect_near_duplicates(second_data: List[Dict[str, Any]], histograms: List[np.ndarray], threshold: float = 0.92):
    """Marks seconds that are visually near-identical to an earlier second in the clip."""
    n = len(second_data)
    for i in range(1, n):
        hist_i = histograms[i]
        for j in range(0, i):
            if i - j > 1:
                hist_j = histograms[j]
                sim = cv2.compareHist(hist_i, hist_j, cv2.HISTCMP_CORREL)
                if sim >= threshold:
                    second_data[i]["is_duplicate"] = True
                    second_data[i]["duplicate_of"] = j
                    second_data[i]["score"] = round(second_data[i]["score"] * 0.7, 1)
                    break


def _find_best_window(second_data: List[Dict[str, Any]], window_size: int = 2) -> Dict[str, Any]:
    """Finds the contiguous time window with the highest average score (perfect hook!)."""
    n = len(second_data)
    if n == 0:
        return {"start": 0.0, "end": 2.0, "score": 50.0}
    if n <= window_size:
        avg = float(np.mean([s["score"] for s in second_data]))
        return {"start": 0.0, "end": float(n), "score": round(avg, 1)}

    best_avg = -1.0
    best_idx = 0
    for i in range(n - window_size + 1):
        window_scores = [second_data[i + k]["score"] for k in range(window_size)]
        avg = float(np.mean(window_scores))
        if avg > best_avg:
            best_avg = avg
            best_idx = i

    return {
        "start": float(best_idx),
        "end": float(best_idx + window_size),
        "score": round(best_avg, 1),
    }


def detect_audio_beats(audio_file: str) -> Dict[str, Any]:
    """
    Detects beat timestamps (energy onsets) from an audio track for rhythm-synced cuts.
    Uses ffmpeg to extract raw audio + numpy energy envelope peak picking.
    """
    if not os.path.exists(audio_file):
        return {"beat_times": [], "tempo_bpm": 120.0, "beat_count": 0}

    cmd = [
        "ffmpeg", "-y", "-i", audio_file,
        "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            timeout=20
        )
        raw_data = proc.stdout
        if not raw_data:
            return {"beat_times": [], "tempo_bpm": 120.0, "beat_count": 0}

        audio_samples = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32)
        sr = 16000
        hop_length = 512
        frame_count = len(audio_samples) // hop_length

        if frame_count < 10:
            return {"beat_times": [], "tempo_bpm": 120.0, "beat_count": 0}

        frames = audio_samples[:frame_count * hop_length].reshape((frame_count, hop_length))
        energy = np.sqrt(np.mean(frames ** 2, axis=1))

        onset_env = np.diff(energy)
        onset_env = np.maximum(0, onset_env)

        std_val = np.std(onset_env)
        if std_val > 0:
            onset_env = (onset_env - np.mean(onset_env)) / std_val
        else:
            return {"beat_times": [], "tempo_bpm": 120.0, "beat_count": 0}

        beat_indices = []
        if find_peaks is not None:
            min_dist = int(0.3 * (sr / hop_length))
            peaks, _ = find_peaks(onset_env, height=1.0, distance=min_dist)
            beat_indices = list(peaks)
        else:
            min_dist = int(0.3 * (sr / hop_length))
            for i in range(1, len(onset_env) - 1):
                if onset_env[i] > 1.2 and onset_env[i] > onset_env[i - 1] and onset_env[i] >= onset_env[i + 1]:
                    if not beat_indices or (i - beat_indices[-1]) >= min_dist:
                        beat_indices.append(i)

        time_per_hop = hop_length / float(sr)
        beat_times = [round(float(idx * time_per_hop), 3) for idx in beat_indices]

        tempo = 120.0
        if len(beat_times) >= 3:
            diffs = np.diff(beat_times)
            median_interval = float(np.median(diffs))
            if median_interval > 0.1:
                tempo = round(60.0 / median_interval, 1)

        return {
            "beat_times": beat_times,
            "tempo_bpm": tempo,
            "beat_count": len(beat_times),
        }
    except Exception as e:
        return {"beat_times": [], "tempo_bpm": 120.0, "beat_count": 0, "error": str(e)}


def analyze_audio_levels(media_file: str) -> Dict[str, Any]:
    """
    Measures integrated loudness (LUFS), true peak (dBFS), and clipping.
    """
    if not os.path.exists(media_file):
        return {"loudness_lufs": -24.0, "true_peak_db": -6.0, "clipping": False}

    cmd = [
        "ffmpeg", "-i", media_file,
        "-af", "ebur128=framelog=verbose",
        "-f", "null", "-"
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
            timeout=20
        )
        stderr = proc.stderr or ""

        lufs = -24.0
        peak = -6.0
        clipping = False

        for line in stderr.splitlines():
            line_s = line.strip()
            if "I:" in line_s and "LUFS" in line_s:
                parts = line_s.split("I:")[1].split("LUFS")[0].strip()
                try:
                    lufs = float(parts)
                except Exception:
                    pass
            elif "Peak:" in line_s and "dBFS" in line_s:
                parts = line_s.split("Peak:")[1].split("dBFS")[0].strip()
                try:
                    peak = float(parts)
                except Exception:
                    pass

        if peak >= -0.2:
            clipping = True

        return {
            "loudness_lufs": round(lufs, 1),
            "true_peak_db": round(peak, 1),
            "clipping": clipping,
        }
    except Exception:
        return {"loudness_lufs": -24.0, "true_peak_db": -6.0, "clipping": False}
