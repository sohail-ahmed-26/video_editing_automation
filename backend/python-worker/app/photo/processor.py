"""
Photo Editing Processor
Applies image transformations in sequence using Pillow and OpenCV:
- smart_crop & resize to chosen frame (16:9, 1:1, 4:5, 9:16)
- rotate & EXIF correction
- brightness, contrast, saturation, sharpness
- auto levels / white balance
- denoise
- artistic color filters (warm, cool, vintage, black_and_white, cinematic, vivid)
- vignette
- blur background / background removal & replacement
- text and brand watermark logo overlay
"""

import os
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageOps, ImageFilter, ImageDraw, ImageFont
from typing import Dict, Any, List, Optional, Tuple
from app.photo.analyzer import analyze_photo, load_normalized_image
from app.photo.bg_remover import extract_subject_mask, replace_background

FRAME_DIMENSIONS = {
    "16:9": (1920, 1080),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "9:16": (1080, 1920),
}


def parse_target_ratio(aspect_str: str) -> Tuple[float, int, int]:
    """Returns (ratio_float, target_w, target_h)."""
    norm = aspect_str.strip().lower()
    if "16:9" in norm or "youtube" in norm or "landscape" in norm:
        return 16.0 / 9.0, 1920, 1080
    if "1:1" in norm or "square" in norm:
        return 1.0, 1080, 1080
    if "4:5" in norm or "portrait" in norm:
        return 4.0 / 5.0, 1080, 1350
    if "9:16" in norm or "story" in norm or "reel" in norm or "tiktok" in norm or "vertical" in norm:
        return 9.0 / 16.0, 1080, 1920
    # Default to 16:9
    return 16.0 / 9.0, 1920, 1080


def apply_smart_crop(img: Image.Image, target_ratio: float, saliency: Dict[str, float]) -> Image.Image:
    """
    Crops image to target aspect ratio while keeping the focal subject (face/saliency center) in view.
    """
    orig_w, orig_h = img.size
    orig_ratio = orig_w / float(orig_h)

    if abs(orig_ratio - target_ratio) < 0.01:
        return img

    cx = saliency.get("x", 0.5)
    cy = saliency.get("y", 0.5)

    if orig_ratio > target_ratio:
        # Original is wider than target -> crop width
        new_w = int(orig_h * target_ratio)
        new_h = orig_h

        # Center crop window around cx
        target_center_x = int(cx * orig_w)
        left = target_center_x - new_w // 2
        # Clamp to bounds
        left = max(0, min(orig_w - new_w, left))
        top = 0
        right = left + new_w
        bottom = orig_h
    else:
        # Original is taller than target -> crop height
        new_w = orig_w
        new_h = int(orig_w / target_ratio)

        # Center crop window around cy
        target_center_y = int(cy * orig_h)
        top = target_center_y - new_h // 2
        # Clamp to bounds
        top = max(0, min(orig_h - new_h, top))
        left = 0
        right = orig_w
        bottom = top + new_h

    return img.crop((left, top, right, bottom))


def apply_auto_levels(img: Image.Image) -> Image.Image:
    """Performs per-channel histogram stretching with 0.5% clipping for balanced color & exposure."""
    np_img = np.array(img.convert("RGB"))
    result = np.zeros_like(np_img)
    for c in range(3):
        channel = np_img[:, :, c]
        low, high = np.percentile(channel, (0.5, 99.5))
        if high - low > 1:
            stretched = np.clip((channel - low) * (255.0 / (high - low)), 0, 255)
            result[:, :, c] = stretched.astype(np.uint8)
        else:
            result[:, :, c] = channel
    return Image.fromarray(result)


def apply_denoise(img: Image.Image, strength: int = 7) -> Image.Image:
    """Applies fast bilateral filter for gentle edge-preserving noise reduction."""
    np_bgr = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
    denoised = cv2.bilateralFilter(np_bgr, d=strength, sigmaColor=35, sigmaSpace=35)
    return Image.fromarray(cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB))


def apply_color_filter(img: Image.Image, filter_name: str) -> Image.Image:
    """
    Applies stylized color filters:
    - warm: golden hour glow
    - cool: cold cinematic blue
    - vintage: faded shadows, sepia tone
    - black_and_white: high contrast B&W
    - cinematic: teal & orange Hollywood look
    - vivid: rich contrast and boosted saturation
    """
    fn = filter_name.strip().lower()
    rgb = img.convert("RGB")

    if fn in ("none", ""):
        return img

    if fn == "black_and_white" or fn == "bw":
        gray = ImageOps.grayscale(rgb)
        enhanced = ImageEnhance.Contrast(gray).enhance(1.2)
        return enhanced.convert("RGB")

    np_rgb = np.array(rgb).astype(np.float32)

    if fn == "warm":
        # Boost Red & slightly Green, reduce Blue
        np_rgb[:, :, 0] = np.clip(np_rgb[:, :, 0] * 1.10, 0, 255)
        np_rgb[:, :, 1] = np.clip(np_rgb[:, :, 1] * 1.03, 0, 255)
        np_rgb[:, :, 2] = np.clip(np_rgb[:, :, 2] * 0.90, 0, 255)

    elif fn == "cool":
        # Boost Blue, reduce Red
        np_rgb[:, :, 0] = np.clip(np_rgb[:, :, 0] * 0.92, 0, 255)
        np_rgb[:, :, 2] = np.clip(np_rgb[:, :, 2] * 1.12, 0, 255)

    elif fn == "vintage":
        # Sepia tint + faded blacks
        r = np_rgb[:, :, 0] * 0.393 + np_rgb[:, :, 1] * 0.769 + np_rgb[:, :, 2] * 0.189
        g = np_rgb[:, :, 0] * 0.349 + np_rgb[:, :, 1] * 0.686 + np_rgb[:, :, 2] * 0.168
        b = np_rgb[:, :, 0] * 0.272 + np_rgb[:, :, 1] * 0.534 + np_rgb[:, :, 2] * 0.131
        sepia = np.stack([r, g, b], axis=-1)
        # Blend 50% sepia with original and lift dark tones
        blended = np.clip(np_rgb * 0.5 + sepia * 0.5 + 15, 0, 255)
        return Image.fromarray(blended.astype(np.uint8))

    elif fn == "cinematic":
        # Teal (shadows) & Orange (highlights)
        lum = 0.299 * np_rgb[:, :, 0] + 0.587 * np_rgb[:, :, 1] + 0.114 * np_rgb[:, :, 2]
        shadow_mask = np.clip((128.0 - lum) / 128.0, 0, 1)[:, :, np.newaxis]
        highlight_mask = np.clip((lum - 128.0) / 128.0, 0, 1)[:, :, np.newaxis]

        # Orange in highlights: +R, +G, -B
        np_rgb += highlight_mask * np.array([30.0, 15.0, -20.0])
        # Teal in shadows: -R, +G, +B
        np_rgb += shadow_mask * np.array([-20.0, 15.0, 30.0])
        np_rgb = np.clip(np_rgb, 0, 255)

    elif fn == "vivid":
        # High contrast and saturation
        res = Image.fromarray(np_rgb.astype(np.uint8))
        res = ImageEnhance.Color(res).enhance(1.4)
        res = ImageEnhance.Contrast(res).enhance(1.2)
        return res

    return Image.fromarray(np.clip(np_rgb, 0, 255).astype(np.uint8))


def apply_vignette(img: Image.Image, intensity: float = 0.45) -> Image.Image:
    """Applies smooth radial darkening around image edges."""
    w, h = img.size
    # Create radial gradient mask
    mask = Image.new("L", (w, h), 255)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([int(w * -0.2), int(h * -0.2), int(w * 1.2), int(h * 1.2)], fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=int(min(w, h) * 0.35)))

    # Blend with black
    black = Image.new("RGB", (w, h), (0, 0, 0))
    alpha_mask = ImageEnhance.Brightness(mask).enhance(intensity)
    rgb = img.convert("RGB")
    return Image.composite(black, rgb, alpha_mask)


def apply_text_overlay(
    img: Image.Image,
    text: str,
    position: str = "bottom",
    font_size: Optional[int] = None,
    color_hex: str = "#FFFFFF"
) -> Image.Image:
    """Draws styled text with clean outline and padding."""
    if not text or not text.strip():
        return img

    w, h = img.size
    canvas = img.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    actual_size = font_size or max(24, int(min(w, h) * 0.055))
    try:
        font_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../storage/fonts"))
        font_file = os.path.join(font_dir, "NotoSans-Bold.ttf")
        font = ImageFont.truetype(font_file, actual_size)
    except Exception:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Calculate coordinates
    pos = position.lower()
    margin_x = int(w * 0.08)
    margin_y = int(h * 0.08)

    if pos == "top":
        x = (w - text_w) // 2
        y = margin_y
    elif pos == "center":
        x = (w - text_w) // 2
        y = (h - text_h) // 2
    elif pos == "bottom-left":
        x = margin_x
        y = h - text_h - margin_y
    elif pos == "bottom-right":
        x = w - text_w - margin_x
        y = h - text_h - margin_y
    else:  # bottom centered
        x = (w - text_w) // 2
        y = h - text_h - margin_y

    # Draw dark shadow / outline for readability
    outline_color = (0, 0, 0, 220)
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2)]:
        draw.text((x + dx, y + dy), text, font=font, fill=outline_color)

    # Main text
    from app.photo.bg_remover import hex_to_rgb
    text_rgb = hex_to_rgb(color_hex)
    draw.text((x, y), text, font=font, fill=(text_rgb[0], text_rgb[1], text_rgb[2], 255))

    return canvas.convert(img.mode)


def apply_logo_overlay(
    img: Image.Image,
    logo_path: str,
    position: str = "top-right",
    size_percent: int = 14,
    opacity_percent: int = 85
) -> Image.Image:
    """Overlays Brand Kit logo onto the photo with padding and opacity."""
    if not logo_path or not os.path.exists(logo_path):
        return img

    w, h = img.size
    logo = Image.open(logo_path).convert("RGBA")

    # Scale logo
    target_logo_w = max(32, int(w * (size_percent / 100.0)))
    scale_ratio = target_logo_w / float(logo.width)
    target_logo_h = max(16, int(logo.height * scale_ratio))
    logo = logo.resize((target_logo_w, target_logo_h), Image.LANCZOS)

    # Apply opacity
    opacity = max(0.0, min(1.0, opacity_percent / 100.0))
    alpha = logo.split()[3]
    alpha = ImageEnhance.Brightness(alpha).enhance(opacity)
    logo.putalpha(alpha)

    # Coordinates
    margin_x = int(w * 0.05)
    margin_y = int(h * 0.05)
    pos = position.lower()

    if pos == "top-left":
        x, y = margin_x, margin_y
    elif pos == "bottom-left":
        x, y = margin_x, h - target_logo_h - margin_y
    elif pos == "bottom-right":
        x, y = w - target_logo_w - margin_x, h - target_logo_h - margin_y
    else:  # top-right
        x, y = w - target_logo_w - margin_x, margin_y

    canvas = img.convert("RGBA")
    canvas.paste(logo, (x, y), logo)
    return canvas.convert(img.mode)


def process_photo(
    input_path: str,
    output_path: str,
    plan: Dict[str, Any],
    brand_logo_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes a complete photo editing plan:
    1. Loads normalized image.
    2. Runs analysis (saliency / face detection).
    3. Executes plan operations in ordered sequence:
       - smart_crop & resize
       - auto_color
       - brightness, contrast, saturation, sharpness
       - denoise
       - filter
       - background removal / replacement
       - vignette
       - text overlay
       - brand logo
    4. Saves output in target format (JPG, PNG, WEBP).
    """
    img = load_normalized_image(input_path)
    analysis = analyze_photo(input_path)
    saliency = analysis["saliency_center"]

    target_frame = plan.get("frame", "16:9")
    target_ratio, target_w, target_h = parse_target_ratio(target_frame)

    operations_applied = []

    # 1. Smart Crop & Resize
    if plan.get("smart_crop", True):
        img = apply_smart_crop(img, target_ratio, saliency)
        img = img.resize((target_w, target_h), Image.LANCZOS)
        operations_applied.append(f"smart_crop ({target_frame})")

    # 2. Auto Color / Levels
    if plan.get("auto_color", False):
        img = apply_auto_levels(img)
        operations_applied.append("auto_color_levels")

    # 3. Brightness
    brightness_val = plan.get("brightness", 1.0)
    if brightness_val != 1.0:
        factor = float(np.clip(brightness_val, 0.5, 1.8))
        img = ImageEnhance.Brightness(img).enhance(factor)
        operations_applied.append(f"brightness ({factor})")

    # 4. Contrast
    contrast_val = plan.get("contrast", 1.0)
    if contrast_val != 1.0:
        factor = float(np.clip(contrast_val, 0.5, 1.8))
        img = ImageEnhance.Contrast(img).enhance(factor)
        operations_applied.append(f"contrast ({factor})")

    # 5. Saturation
    saturation_val = plan.get("saturation", 1.0)
    if saturation_val != 1.0:
        factor = float(np.clip(saturation_val, 0.0, 2.5))
        img = ImageEnhance.Color(img).enhance(factor)
        operations_applied.append(f"saturation ({factor})")

    # 6. Sharpness
    sharpness_val = plan.get("sharpness", 1.0)
    if sharpness_val != 1.0:
        factor = float(np.clip(sharpness_val, 0.5, 2.5))
        img = ImageEnhance.Sharpness(img).enhance(factor)
        operations_applied.append(f"sharpness ({factor})")

    # 7. Denoise
    if plan.get("denoise", False):
        img = apply_denoise(img)
        operations_applied.append("denoise")

    # 8. Filter
    filter_name = plan.get("filter", "none")
    if filter_name and filter_name != "none":
        img = apply_color_filter(img, filter_name)
        operations_applied.append(f"filter ({filter_name})")

    # 9. Background Removal / Replacement
    bg_op = plan.get("background", {})
    bg_mode = bg_op.get("mode", "keep")  # keep, remove, solid, gradient, blur, custom
    if bg_mode and bg_mode != "keep":
        fg_rgba = extract_subject_mask(img)
        img = replace_background(
            original_img=img,
            fg_rgba=fg_rgba,
            bg_type=bg_mode if bg_mode != "remove" else "transparent",
            color=bg_op.get("color", "#FFFFFF"),
            color2=bg_op.get("color2", "#111827"),
            custom_bg_path=bg_op.get("custom_image_path", None),
            blur_radius=bg_op.get("blur_radius", 25)
        )
        operations_applied.append(f"background ({bg_mode})")

    # 10. Vignette
    if plan.get("vignette", False):
        img = apply_vignette(img, intensity=0.45)
        operations_applied.append("vignette")

    # 11. Text Overlay
    text_data = plan.get("text_overlay")
    if text_data and isinstance(text_data, dict) and text_data.get("text"):
        img = apply_text_overlay(
            img=img,
            text=text_data.get("text", ""),
            position=text_data.get("position", "bottom"),
            font_size=text_data.get("font_size"),
            color_hex=text_data.get("color", "#FFFFFF")
        )
        operations_applied.append(f"text_overlay ('{text_data.get('text')}')")

    # 12. Brand Logo Overlay
    if plan.get("use_brand_logo", False) and brand_logo_path:
        img = apply_logo_overlay(
            img=img,
            logo_path=brand_logo_path,
            position=plan.get("logo_position", "top-right"),
            size_percent=plan.get("logo_size", 14),
            opacity_percent=plan.get("logo_opacity", 85)
        )
        operations_applied.append("brand_logo")

    # Save Output (strip Software tag and EXIF tool info)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    ext = os.path.splitext(output_path)[1].lower()

    # Clear metadata dictionary
    img.info = {}

    if ext in (".png",):
        img.save(output_path, "PNG", optimize=True)
    elif ext in (".webp",):
        img.save(output_path, "WEBP", quality=95, exif=b"")
    else:  # JPG default
        if img.mode in ("RGBA", "P"):
            # Flatten transparency to white before saving as JPG
            bg_white = Image.new("RGB", img.size, (255, 255, 255))
            bg_white.paste(img, (0, 0), img if img.mode == "RGBA" else None)
            img = bg_white
            img.info = {}
        img.save(output_path, "JPEG", quality=95, optimize=True, exif=b"")

    return {
        "output_path": output_path,
        "width": img.width,
        "height": img.height,
        "format": ext.replace(".", "").upper(),
        "operations": operations_applied,
        "file_size": os.path.getsize(output_path)
    }

