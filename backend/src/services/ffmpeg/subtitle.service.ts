import fs from 'node:fs';
import path from 'node:path';
import { storageService } from '../storage/storage.service.js';

export type SubtitleStyle = 'viral' | 'clean' | 'minimal';

export interface TimedWord {
  word: string;
  start: number; // in source clip seconds
  end: number;   // in source clip seconds
}

export interface TimedTranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TimedWord[];
}

export interface AssetTranscriptData {
  language?: string;
  segments: TimedTranscriptSegment[];
}

export interface SubtitleClipMapping {
  assetId: string;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  timelineStart: number;
  timelineDuration: number;
  removedSilences?: Array<{ start: number; end: number }>;
}

export interface TextOverlayItem {
  text: string;
  startTime: number;
  endTime: number;
  position?: 'top' | 'center' | 'bottom';
  style?: string;
}

export interface GenerateAssOptions {
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  aspectRatio: string;
  style?: SubtitleStyle;
  highlightColorHex?: string; // e.g. '#FFDE59' (gold) or brand color
  clipMappings: SubtitleClipMapping[];
  transcriptsByAssetId: Map<string, AssetTranscriptData>;
  textOverlays?: TextOverlayItem[];
  fontsDir?: string;
}

/**
 * Checks if a string contains Arabic or Urdu unicode characters.
 */
export function isRtlText(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Formats seconds into ASS timestamp format: H:MM:SS.cc (centiseconds).
 */
export function formatAssTime(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const cs = Math.floor(Math.round((safeSec % 1) * 100));

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/**
 * Converts standard #RRGGBB or #RRGGBBAA hex color to ASS &HAABBGGRR& format.
 */
export function hexToAssColor(hex: string, alphaHex = '00'): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length === 8) {
    // If RGBA provided
    alphaHex = clean.substring(6, 8);
    clean = clean.substring(0, 6);
  }
  if (clean.length !== 6) {
    clean = 'FFFFFF';
  }
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H${alphaHex.toUpperCase()}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}&`;
}

export class SubtitleService {
  /**
   * Generates an Advanced SubStation Alpha (.ass) file with:
   * 1. Word-level synchronized timestamps mapped to the final edited timeline.
   * 2. Viral, Clean, or Minimal caption styles.
   * 3. Safe areas (accounting for TikTok/Reels UI margins for 9:16).
   * 4. RTL font support for Urdu and Arabic text.
   * 5. Animated text overlays from the plan.
   */
  public generateAssFile(options: GenerateAssOptions): string {
    const {
      outputPath,
      targetWidth,
      targetHeight,
      aspectRatio,
      style = 'viral',
      highlightColorHex = '#FFDE59',
      clipMappings,
      transcriptsByAssetId,
      textOverlays = [],
    } = options;

    const isVertical = aspectRatio === '9:16' || targetHeight > targetWidth;

    // Safe Area Margins
    // Vertical 9:16 requires 240px bottom margin to clear TikTok / Reels captions and sound bar
    const marginV = isVertical ? 240 : 70;
    const marginL = isVertical ? 60 : 80;
    const marginR = isVertical ? 60 : 80;

    // Font Sizes scaled to resolution
    const baseFontSize = isVertical ? Math.round(targetWidth * 0.058) : Math.round(targetHeight * 0.046);
    const viralFontSize = Math.round(baseFontSize * 1.15);
    const minimalFontSize = Math.round(baseFontSize * 0.9);
    const titleFontSize = Math.round(baseFontSize * 1.35);

    // Highlight ASS color for active word in Viral style
    const activeWordAssColor = hexToAssColor(highlightColorHex);
    const primaryWhiteAss = '&H00FFFFFF&';
    const darkOutlineAss = '&H00000000&';
    const semiBlackBoxAss = '&H80000000&'; // 50% opacity box

    // Headers & Styles
    const lines: string[] = [
      '[Script Info]',
      'Title: Subtitles',
      'ScriptType: v4.00+',
      'WrapStyle: 0',
      'ScaledBorderAndShadow: yes',
      `PlayResX: ${targetWidth}`,
      `PlayResY: ${targetHeight}`,
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      // Latin Styles
      `Style: Viral_Latin,Noto Sans,${viralFontSize},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,-1,0,0,0,100,100,1,0,1,3.5,2,2,${marginL},${marginR},${marginV},1`,
      `Style: Clean_Latin,Noto Sans,${baseFontSize},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,0,0,0,0,100,100,0,0,1,2.0,1.5,2,${marginL},${marginR},${marginV},1`,
      `Style: Minimal_Latin,Noto Sans,${minimalFontSize},${primaryWhiteAss},&H000000FF,${darkOutlineAss},${semiBlackBoxAss},0,0,0,0,100,100,0,0,3,1.0,0,2,${marginL},${marginR},${marginV},1`,
      // RTL Styles (Urdu & Arabic)
      `Style: Viral_RTL,Noto Sans Arabic,${Math.round(viralFontSize * 1.1)},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,-1,0,0,0,100,100,1,0,1,3.5,2,2,${marginL},${marginR},${marginV},1`,
      `Style: Clean_RTL,Noto Sans Arabic,${Math.round(baseFontSize * 1.1)},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,0,0,0,0,100,100,0,0,1,2.0,1.5,2,${marginL},${marginR},${marginV},1`,
      `Style: Minimal_RTL,Noto Sans Arabic,${Math.round(minimalFontSize * 1.1)},${primaryWhiteAss},&H000000FF,${darkOutlineAss},${semiBlackBoxAss},0,0,0,0,100,100,0,0,3,1.0,0,2,${marginL},${marginR},${marginV},1`,
      // Text Overlay Styles (Titles / Callouts)
      `Style: Overlay_Top,Noto Sans,${titleFontSize},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,-1,0,0,0,100,100,1,0,1,4.0,2,8,${marginL},${marginR},${marginV + 60},1`,
      `Style: Overlay_Center,Noto Sans,${titleFontSize},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,-1,0,0,0,100,100,1,0,1,4.0,2,5,${marginL},${marginR},${marginV},1`,
      `Style: Overlay_Bottom,Noto Sans,${titleFontSize},${primaryWhiteAss},&H000000FF,${darkOutlineAss},&H80000000,-1,0,0,0,100,100,1,0,1,4.0,2,2,${marginL},${marginR},${marginV + 80},1`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ];

    // Helper to calculate timeline time from source clip time
    const mapSourceTimeToTimeline = (
      sourceTime: number,
      mapping: SubtitleClipMapping
    ): number => {
      let effectiveSourceTime = sourceTime;
      // If silences were removed before this timestamp, subtract removed durations
      if (mapping.removedSilences && mapping.removedSilences.length > 0) {
        let removedBefore = 0;
        for (const silence of mapping.removedSilences) {
          if (silence.end <= sourceTime) {
            removedBefore += (silence.end - silence.start);
          } else if (silence.start < sourceTime && silence.end > sourceTime) {
            removedBefore += (sourceTime - silence.start);
          }
        }
        effectiveSourceTime -= removedBefore;
      }
      const relativeOffset = (effectiveSourceTime - mapping.sourceIn) / (mapping.speed || 1.0);
      return mapping.timelineStart + Math.max(0, relativeOffset);
    };

    // 1. Process Clip Subtitles
    for (const mapping of clipMappings) {
      const transcript = transcriptsByAssetId.get(mapping.assetId);
      if (!transcript || !transcript.segments || transcript.segments.length === 0) {
        continue;
      }

      for (const seg of transcript.segments) {
        // Check if segment falls within trimmed clip
        if (seg.end <= mapping.sourceIn || seg.start >= mapping.sourceOut) {
          continue;
        }

        const isRtl = isRtlText(seg.text);
        const stylePrefix = style === 'clean' ? 'Clean' : style === 'minimal' ? 'Minimal' : 'Viral';
        const styleName = `${stylePrefix}_${isRtl ? 'RTL' : 'Latin'}`;

        // If word-level timing is available
        const words = (seg.words || []).filter(
          (w) => w.end > mapping.sourceIn && w.start < mapping.sourceOut && w.word.trim()
        );

        if (words.length > 0) {
          if (style === 'viral') {
            // Group words into bite-sized punchy chunks of 2 to 4 words
            const groupSize = isVertical ? 3 : 4;
            for (let i = 0; i < words.length; i += groupSize) {
              const groupWords = words.slice(i, i + groupSize);
              if (groupWords.length === 0) continue;

              const groupStart = Math.max(groupWords[0].start, mapping.sourceIn);
              const groupEnd = Math.min(groupWords[groupWords.length - 1].end, mapping.sourceOut);
              if (groupEnd <= groupStart) continue;

              // Generate per-word active highlight events within the group
              for (let wIdx = 0; wIdx < groupWords.length; wIdx++) {
                const activeWord = groupWords[wIdx];
                const wordStart = Math.max(activeWord.start, mapping.sourceIn);
                const wordEnd = Math.min(activeWord.end, mapping.sourceOut);
                if (wordEnd <= wordStart) continue;

                const tlStart = mapSourceTimeToTimeline(wordStart, mapping);
                const tlEnd = mapSourceTimeToTimeline(wordEnd, mapping);

                // Build line with active word highlighted
                const formattedWords = groupWords.map((gw, idx) => {
                  if (idx === wIdx) {
                    return `{\\c${activeWordAssColor}}${gw.word.trim()}{\\r\\c${primaryWhiteAss}}`;
                  }
                  return gw.word.trim();
                });

                const lineText = formattedWords.join(' ');
                lines.push(
                  `Dialogue: 0,${formatAssTime(tlStart)},${formatAssTime(tlEnd)},${styleName},,0,0,0,,${lineText}`
                );
              }
            }
          } else {
            // Clean or Minimal: show full phrase chunks
            const chunkSize = isVertical ? 5 : 7;
            for (let i = 0; i < words.length; i += chunkSize) {
              const chunkWords = words.slice(i, i + chunkSize);
              if (chunkWords.length === 0) continue;

              const chunkStart = Math.max(chunkWords[0].start, mapping.sourceIn);
              const chunkEnd = Math.min(chunkWords[chunkWords.length - 1].end, mapping.sourceOut);
              if (chunkEnd <= chunkStart) continue;

              const tlStart = mapSourceTimeToTimeline(chunkStart, mapping);
              const tlEnd = mapSourceTimeToTimeline(chunkEnd, mapping);
              const lineText = chunkWords.map((w) => w.word.trim()).join(' ');

              lines.push(
                `Dialogue: 0,${formatAssTime(tlStart)},${formatAssTime(tlEnd)},${styleName},,0,0,0,,${lineText}`
              );
            }
          }
        } else {
          // Fallback: Segment-level timing when word timestamps are absent
          const segStart = Math.max(seg.start, mapping.sourceIn);
          const segEnd = Math.min(seg.end, mapping.sourceOut);
          if (segEnd > segStart) {
            const tlStart = mapSourceTimeToTimeline(segStart, mapping);
            const tlEnd = mapSourceTimeToTimeline(segEnd, mapping);
            lines.push(
              `Dialogue: 0,${formatAssTime(tlStart)},${formatAssTime(tlEnd)},${styleName},,0,0,0,,${seg.text.trim()}`
            );
          }
        }
      }
    }

    // 2. Process Text Overlays (Titles / Callouts with smooth fade animations)
    for (const overlay of textOverlays) {
      if (!overlay.text || overlay.endTime <= overlay.startTime) continue;

      let overlayStyle = 'Overlay_Center';
      if (overlay.position === 'top') {
        overlayStyle = 'Overlay_Top';
      } else if (overlay.position === 'bottom') {
        overlayStyle = 'Overlay_Bottom';
      }

      const isRtl = isRtlText(overlay.text);
      const fontOverride = isRtl ? '{\\fnNoto Sans Arabic}' : '';
      const fadeAnimation = '{\\fad(300,300)}'; // 300ms fade-in, 300ms fade-out
      const fullText = `${fadeAnimation}${fontOverride}${overlay.text}`;

      lines.push(
        `Dialogue: 1,${formatAssTime(overlay.startTime)},${formatAssTime(overlay.endTime)},${overlayStyle},,0,0,0,,${fullText}`
      );
    }

    // Ensure output directory exists and write file
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const assContent = lines.join('\n') + '\n';
    fs.writeFileSync(outputPath, assContent, 'utf-8');
    return outputPath;
  }
}

export const subtitleService = new SubtitleService();

