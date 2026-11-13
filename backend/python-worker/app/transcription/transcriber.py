"""
Transcription Module using faster-whisper.
Runs local speech-to-text with word/segment level timestamps.
"""

import sys
import json
import math
from typing import Dict, Any

# Fix PyAV 14+ compatibility with faster-whisper:
# PyAV 14+ removed the 'metadata_errors' parameter from av.open()
try:
    import av
    _orig_av_open = av.open

    def _safe_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _safe_av_open
except Exception as _patch_err:
    sys.stderr.write(f"PyAV patch warning: {_patch_err}\n")

from faster_whisper import WhisperModel

def transcribe_audio(
    media_path: str,
    model_size: str = "tiny",
    device: str = "cpu",
    compute_type: str = "int8",
    language: str = None
) -> Dict[str, Any]:
    """
    Transcribes audio/video file using faster-whisper.
    Returns:
    {
        "language": "en",
        "duration": 12.4,
        "full_text": "...",
        "word_count": 35,
        "segments": [
            {
                "id": 0,
                "start": 0.0,
                "end": 2.5,
                "text": "...",
                "confidence": 0.95,
                "words": [{"word": "...", "start": 0.0, "end": 0.5, "probability": 0.98}]
            }
        ]
    }
    """
    try:
        # Load local model
        # By default downloaded to huggingface cache directory
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        
        segments_gen, info = model.transcribe(
            media_path,
            beam_size=5,
            word_timestamps=True,
            language=language
        )
        
        detected_language = info.language
        duration = round(info.duration, 2)
        
        segments = []
        full_text_parts = []
        total_words = 0
        
        for seg in segments_gen:
            clean_text = seg.text.strip()
            if not clean_text:
                continue
                
            full_text_parts.append(clean_text)
            
            words_list = []
            if seg.words:
                for w in seg.words:
                    words_list.append({
                        "word": w.word.strip(),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3)
                    })
                    total_words += 1
            else:
                total_words += len(clean_text.split())
                
            # Convert avg_logprob to pseudo confidence score 0.0 - 1.0
            confidence = round(min(1.0, max(0.0, math.exp(seg.avg_logprob))), 3) if seg.avg_logprob else 0.9
            
            segments.append({
                "id": seg.id,
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": clean_text,
                "confidence": confidence,
                "words": words_list
            })
            
        full_text = " ".join(full_text_parts)
        
        return {
            "language": detected_language,
            "duration": duration,
            "full_text": full_text,
            "word_count": total_words,
            "segments": segments
        }
    except Exception as e:
        sys.stderr.write(f"Error during transcription: {str(e)}\n")
        raise e

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Media path argument required"}))
        sys.exit(1)
        
    model_name = sys.argv[2] if len(sys.argv) > 2 else "tiny"
    res = transcribe_audio(sys.argv[1], model_size=model_name)
    print(json.dumps(res))
