import { GeminiEditingPlan, GeminiSegment } from '../gemini/gemini-planner.service.js';
import { resolvePlatformPreset, PlatformPreset } from './platform-presets.js';
import { VideoAnalysisResult, VideoSecondAnalysis } from '../python/python-bridge.service.js';

export interface AssetQualityContext {
  id: string;
  originalName?: string;
  filename?: string;
  storagePath?: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  isPhoto?: boolean;
  hasAudio?: boolean;
  qualityAnalysis?: VideoAnalysisResult;
  transcriptionSegments?: Array<{ start: number; end: number; text: string }>;
  silences?: Array<{ start: number; end: number }>;
}

export interface RuleEngineInput {
  plan: GeminiEditingPlan;
  assets: AssetQualityContext[];
  targetPlatform?: string;
  targetDurationSeconds?: number;
  musicBeats?: number[];
}

export class RuleEngineService {
  /**
   * Validates and fixes an editing plan according to editorial rules:
   * 1. Multi-clip coverage / single-clip non-overlapping
   * 2. Hook placement & dropping weak/blurry/shaky shots
   * 3. Shot length clamping (0.8s - 4.0s unless continuous speech)
   * 4. Pacing curve (fast cuts in middle, decisive ending)
   * 5. Target duration within +/- 10%
   * 6. Cut alignment to music beats and movement onsets
   */
  public async validateAndFixPlan(input: RuleEngineInput): Promise<GeminiEditingPlan> {
    const { plan, assets, targetPlatform, musicBeats } = input;
    const preset = resolvePlatformPreset(targetPlatform || plan.frame?.platform, plan.frame?.aspectRatio);
    const targetDuration = input.targetDurationSeconds || plan.targetDurationSeconds || preset.targetDurationSeconds;

    console.log(`[RuleEngine] Validating plan for preset '${preset.name}', target ${targetDuration}s, assets: ${assets.length}`);

    // Deep clone plan segments to avoid mutating input directly
    let segments: GeminiSegment[] = JSON.parse(JSON.stringify(plan.segments || []));
    const assetMap = new Map<string, AssetQualityContext>(assets.map((a) => [a.id, a]));

    // --- RULE 1: Multi-clip coverage or single-clip non-overlapping ---
    segments = this.enforceAssetCoverage(segments, assets, preset);

    // --- RULE 2: Hook first, strongest shots first, drop bad shots ---
    segments = this.enforceHookAndFilterBadShots(segments, assetMap, preset);

    // --- RULE 3: Clamp shot lengths (0.8s to 4.0s unless continuous speech) ---
    segments = this.enforceShotLengthLimits(segments, assetMap, preset);

    // --- RULE 4: Pacing curve (faster cuts in middle, decisive landing) ---
    segments = this.enforcePacingCurve(segments, assetMap, preset);

    // --- RULE 5: Total duration within +/- 10% of target ---
    segments = this.enforceTargetDurationBounds(segments, assetMap, preset, targetDuration);

    // --- RULE 6: Align cuts to music beats & movement onsets ---
    if (musicBeats && musicBeats.length > 0) {
      segments = this.alignCutsToMusicBeats(segments, assetMap, musicBeats);
    }

    // --- RULE 7: Assign J-cuts and L-cuts for dialog & narrative flow ---
    segments = this.assignJAndLCuts(segments, assetMap);

    // Recalculate final target duration
    const finalDuration = segments.reduce(
      (sum, s) => sum + Math.max(0.1, (s.sourceOut - s.sourceIn) / (s.speed || 1.0)),
      0
    );

    // Clean up captions and text overlays
    const sanitizedCaptions = (plan.captions || [])
      .filter((c) => c.startTime < finalDuration)
      .map((c) => ({
        ...c,
        endTime: Math.min(finalDuration, c.endTime),
      }));

    const sanitizedOverlays = (plan.textOverlays || [])
      .filter((o) => o.startTime < finalDuration)
      .map((o) => ({
        ...o,
        endTime: Math.min(finalDuration, o.endTime),
      }));

    console.log(`[RuleEngine] Plan verified: ${segments.length} segments, final duration: ${finalDuration.toFixed(1)}s (target: ${targetDuration}s)`);

    return {
      ...plan,
      targetDurationSeconds: Number(finalDuration.toFixed(2)),
      segments,
      captions: sanitizedCaptions,
      textOverlays: sanitizedOverlays,
    };
  }

  /**
   * Rule 1:
   * - If multiple clips exist, every uploaded clip MUST be used at least once.
   * - If only 1 clip exists, sub-segments must be non-overlapping without repeating 2+ seconds.
   */
  private enforceAssetCoverage(
    segments: GeminiSegment[],
    assets: AssetQualityContext[],
    preset: PlatformPreset
  ): GeminiSegment[] {
    if (assets.length === 0) return segments;

    if (assets.length === 1) {
      // Single clip: ensure non-overlapping sub-segments without repeating any 2 seconds
      return this.enforceNonOverlappingSingleClip(segments, assets[0], preset);
    }

    // Multiple clips: ensure all different uploaded clips are used
    const usedIds = new Set(segments.map((s) => s.assetId));
    const missingAssets = assets.filter((a) => !usedIds.has(a.id));

    if (missingAssets.length === 0) {
      return segments;
    }

    console.log(`[RuleEngine] Missing ${missingAssets.length} clip(s) in plan. Injecting them to ensure full coverage.`);
    const result = [...segments];

    for (const missing of missingAssets) {
      let sourceIn = 0;
      let sourceOut = Math.min(missing.durationSeconds, Math.max(1.2, preset.shotLengthRange[0] || 1.5));

      // Pick best segment if quality analysis is present
      if (missing.qualityAnalysis?.best_moment) {
        const bm = missing.qualityAnalysis.best_moment;
        const dur = Math.min(preset.shotLengthRange[1] || 3.0, Math.max(1.2, bm.end - bm.start));
        sourceIn = Math.max(0, bm.start);
        sourceOut = Math.min(missing.durationSeconds, sourceIn + dur);
      } else if (missing.qualityAnalysis?.seconds && missing.qualityAnalysis.seconds.length > 0) {
        const goodSecs = missing.qualityAnalysis.seconds
          .filter((s) => !s.is_bad_shot)
          .sort((a, b) => b.score - a.score);
        if (goodSecs.length > 0) {
          sourceIn = Math.max(0, goodSecs[0].second);
          sourceOut = Math.min(missing.durationSeconds, sourceIn + 2.0);
        }
      }

      const injectedSegment: GeminiSegment = {
        assetId: missing.id,
        sourceIn: Number(sourceIn.toFixed(2)),
        sourceOut: Number(sourceOut.toFixed(2)),
        speed: 1.0,
        transition: 'cut',
        motionEffect: 'none',
        reason: 'RuleEngine: included omitted asset to represent all uploaded footage',
      };

      // Insert at middle position
      const insertIdx = Math.max(1, Math.floor(result.length / 2));
      result.splice(insertIdx, 0, injectedSegment);
    }

    return result;
  }

  /**
   * For single clip: ensure sub-segments do not overlap by >= 2 seconds.
   */
  private enforceNonOverlappingSingleClip(
    segments: GeminiSegment[],
    asset: AssetQualityContext,
    preset: PlatformPreset
  ): GeminiSegment[] {
    if (segments.length <= 1) return segments;

    const result: GeminiSegment[] = [];
    const usedIntervals: Array<{ start: number; end: number }> = [];

    for (const seg of segments) {
      let sIn = seg.sourceIn;
      let sOut = seg.sourceOut;
      const desiredDur = Math.max(0.8, sOut - sIn);

      // Check overlap with previously scheduled intervals
      let overlaps = false;
      for (const used of usedIntervals) {
        const overlapStart = Math.max(sIn, used.start);
        const overlapEnd = Math.min(sOut, used.end);
        if (overlapEnd - overlapStart >= 2.0 || (overlapEnd > overlapStart && (sOut - sIn) <= 3.0)) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) {
        // Find an unused time window in the clip
        const step = 0.5;
        let foundWindow: { start: number; end: number } | null = null;
        for (let candidateStart = 0; candidateStart + desiredDur <= asset.durationSeconds; candidateStart += step) {
          const candidateEnd = candidateStart + desiredDur;
          const hasConflict = usedIntervals.some(
            (u) => Math.max(candidateStart, u.start) < Math.min(candidateEnd, u.end)
          );
          if (!hasConflict) {
            foundWindow = { start: candidateStart, end: candidateEnd };
            break;
          }
        }

        if (foundWindow) {
          sIn = foundWindow.start;
          sOut = foundWindow.end;
        }
      }

      usedIntervals.push({ start: sIn, end: sOut });
      result.push({
        ...seg,
        sourceIn: Number(sIn.toFixed(2)),
        sourceOut: Number(sOut.toFixed(2)),
      });
    }

    return result;
  }

  /**
   * Rule 2:
   * - Hook first: highest scoring moment from local analysis in the first 2 seconds.
   * - Strongest shots first.
   * - Weak / blurry / shaky bad shots dropped or repaired.
   */
  private enforceHookAndFilterBadShots(
    segments: GeminiSegment[],
    assetMap: Map<string, AssetQualityContext>,
    preset: PlatformPreset
  ): GeminiSegment[] {
    if (segments.length === 0) return segments;

    // 1. Repair or drop bad segments
    const cleanedSegments: GeminiSegment[] = [];
    for (const seg of segments) {
      const asset = assetMap.get(seg.assetId);
      if (!asset || !asset.qualityAnalysis) {
        cleanedSegments.push(seg);
        continue;
      }

      const isBad = this.isSegmentBad(seg, asset.qualityAnalysis);
      if (isBad) {
        console.log(`[RuleEngine] Detected bad/blurry/shaky shot in clip ${asset.filename || seg.assetId} at ${seg.sourceIn}-${seg.sourceOut}s`);
        // Try to find a better time window in this asset
        const cleanWindow = this.findCleanWindow(asset, (seg.sourceOut - seg.sourceIn) / (seg.speed || 1.0));
        if (cleanWindow) {
          console.log(`[RuleEngine] Relocated bad shot to clean moment ${cleanWindow.start}-${cleanWindow.end}s`);
          cleanedSegments.push({
            ...seg,
            sourceIn: cleanWindow.start,
            sourceOut: cleanWindow.end,
            reason: `${seg.reason || ''} (RuleEngine: relocated from bad region)`,
          });
        } else if (cleanedSegments.length + (segments.length - cleanedSegments.length) > 2) {
          // If we have enough clips, drop the bad shot
          console.log(`[RuleEngine] Dropping unrepairable bad shot.`);
          continue;
        } else {
          cleanedSegments.push(seg);
        }
      } else {
        cleanedSegments.push(seg);
      }
    }

    if (cleanedSegments.length === 0) {
      cleanedSegments.push(segments[0]);
    }

    // 2. Identify the absolute best hook moment across all assets
    let bestHook: { assetId: string; start: number; end: number; score: number } | null = null;
    const targetHookDur = preset.hookDurationSeconds || 2.0;

    for (const [, asset] of assetMap) {
      if (!asset.qualityAnalysis) continue;
      const bm = asset.qualityAnalysis.best_moment;
      if (bm && bm.score > (bestHook?.score || 0)) {
        const start = Math.max(0, bm.start);
        const end = Math.min(asset.durationSeconds, start + targetHookDur);
        bestHook = {
          assetId: asset.id,
          start,
          end,
          score: bm.score,
        };
      }
    }

    // 3. Place Hook as the first segment
    if (bestHook && bestHook.score > 40) {
      const hookDur = Math.max(1.5, Math.min(2.5, bestHook.end - bestHook.start));
      // Check if existing first segment already is the best hook
      const isAlreadyHook =
        cleanedSegments[0].assetId === bestHook.assetId &&
        Math.abs(cleanedSegments[0].sourceIn - bestHook.start) < 1.0;

      if (!isAlreadyHook) {
        console.log(`[RuleEngine] Setting hook: asset ${bestHook.assetId} at ${bestHook.start.toFixed(1)}s (score: ${bestHook.score})`);
        const existingIdx = cleanedSegments.findIndex(
          (s) => s.assetId === bestHook!.assetId && Math.abs(s.sourceIn - bestHook!.start) < 2.0
        );

        const hookSegment: GeminiSegment = {
          assetId: bestHook.assetId,
          sourceIn: Number(bestHook.start.toFixed(2)),
          sourceOut: Number((bestHook.start + hookDur).toFixed(2)),
          speed: 1.0,
          transition: 'cut',
          motionEffect: preset.isVertical ? 'punch_in' : 'none',
          reason: 'RuleEngine: high-impact hook moment from local quality analysis',
        };

        if (existingIdx > 0) {
          // Remove from later and put at the very beginning
          cleanedSegments.splice(existingIdx, 1);
        }
        cleanedSegments.unshift(hookSegment);
      } else {
        // Clamp existing first segment to hook duration
        cleanedSegments[0].sourceOut = Number(
          Math.min(
            assetMap.get(cleanedSegments[0].assetId)?.durationSeconds || 99,
            cleanedSegments[0].sourceIn + hookDur
          ).toFixed(2)
        );
      }
    }

    return cleanedSegments;
  }

  /**
   * Rule 3:
   * Clamp shot lengths: 0.8s to 4.0s (longer only if continuous speech segment).
   */
  private enforceShotLengthLimits(
    segments: GeminiSegment[],
    assetMap: Map<string, AssetQualityContext>,
    preset: PlatformPreset
  ): GeminiSegment[] {
    const minDur = 0.8;
    const maxDur = 4.0;

    return segments.map((seg) => {
      const asset = assetMap.get(seg.assetId);
      const maxAssetDur = asset?.durationSeconds || 60;
      const speed = seg.speed || 1.0;
      let dur = (seg.sourceOut - seg.sourceIn) / speed;

      // Check if continuous speech is present
      const isSpeech = this.isContinuousSpeech(seg, asset);

      if (isSpeech) {
        // Allow up to 6.0s for speech sentences
        if (dur > 6.0) {
          dur = 6.0;
          seg.sourceOut = Math.min(maxAssetDur, seg.sourceIn + dur * speed);
        }
      } else {
        if (dur < minDur) {
          dur = minDur;
          seg.sourceOut = Math.min(maxAssetDur, seg.sourceIn + dur * speed);
          if (seg.sourceOut - seg.sourceIn < minDur * speed) {
            seg.sourceIn = Math.max(0, seg.sourceOut - minDur * speed);
          }
        } else if (dur > maxDur) {
          dur = maxDur;
          seg.sourceOut = Math.min(maxAssetDur, seg.sourceIn + dur * speed);
        }
      }

      return {
        ...seg,
        sourceIn: Number(seg.sourceIn.toFixed(2)),
        sourceOut: Number(seg.sourceOut.toFixed(2)),
      };
    });
  }

  /**
   * Rule 4:
   * Pacing curve: faster cuts in the middle, clean decisive ending.
   */
  private enforcePacingCurve(
    segments: GeminiSegment[],
    assetMap: Map<string, AssetQualityContext>,
    preset: PlatformPreset
  ): GeminiSegment[] {
    if (segments.length <= 2) return segments;

    const totalSegs = segments.length;
    const middleStart = Math.floor(totalSegs * 0.25);
    const middleEnd = Math.floor(totalSegs * 0.8);

    const result = segments.map((seg, idx) => {
      const asset = assetMap.get(seg.assetId);
      const maxAssetDur = asset?.durationSeconds || 60;
      const speed = seg.speed || 1.0;
      let dur = (seg.sourceOut - seg.sourceIn) / speed;

      if (idx >= middleStart && idx <= middleEnd) {
        // Middle segments: fast cuts for peak engagement (1.0s to 2.2s)
        const isSpeech = this.isContinuousSpeech(seg, asset);
        if (!isSpeech && dur > 2.5) {
          const fastDur = Math.max(1.2, Math.min(2.0, preset.shotLengthRange[0] * 1.5 || 1.6));
          seg.sourceOut = Math.min(maxAssetDur, seg.sourceIn + fastDur * speed);
        }
      } else if (idx === totalSegs - 1) {
        // Final segment: clean decisive ending (at least 2.0s up to 3.5s)
        const minOutro = Math.min(2.5, maxAssetDur);
        if (dur < minOutro) {
          const newOut = seg.sourceIn + minOutro * speed;
          if (newOut <= maxAssetDur) {
            seg.sourceOut = newOut;
          } else {
            seg.sourceIn = Math.max(0, maxAssetDur - minOutro * speed);
            seg.sourceOut = maxAssetDur;
          }
        }
      }

      return {
        ...seg,
        sourceIn: Number(seg.sourceIn.toFixed(2)),
        sourceOut: Number(seg.sourceOut.toFixed(2)),
      };
    });

    return result;
  }

  /**
   * Rule 5:
   * Total duration strictly within +/- 10% of preset/target duration.
   */
  private enforceTargetDurationBounds(
    segments: GeminiSegment[],
    assetMap: Map<string, AssetQualityContext>,
    preset: PlatformPreset,
    targetDuration: number
  ): GeminiSegment[] {
    const minTarget = targetDuration * 0.9;
    const maxTarget = targetDuration * 1.1;

    let currentDuration = segments.reduce(
      (sum, s) => sum + (s.sourceOut - s.sourceIn) / (s.speed || 1.0),
      0
    );

    // If too long: trim segments down (starting with middle/non-speech) or drop redundant segments
    if (currentDuration > maxTarget) {
      console.log(`[RuleEngine] Duration ${currentDuration.toFixed(1)}s exceeds max ${maxTarget.toFixed(1)}s. Trimming...`);
      for (let i = segments.length - 2; i >= 1; i--) {
        if (currentDuration <= maxTarget) break;
        const seg = segments[i];
        const asset = assetMap.get(seg.assetId);
        const isSpeech = this.isContinuousSpeech(seg, asset);
        if (isSpeech) continue;

        const dur = (seg.sourceOut - seg.sourceIn) / (seg.speed || 1.0);
        if (dur > 1.2) {
          const trimAmount = Math.min(dur - 1.0, currentDuration - maxTarget);
          seg.sourceOut -= trimAmount * (seg.speed || 1.0);
          currentDuration -= trimAmount;
        }
      }

      // If still too long, drop lowest-scoring clip (keeping at least 2 segments and preserving clip coverage)
      while (currentDuration > maxTarget && segments.length > 2) {
        const dropIdx = segments.length - 2; // drop second to last
        const droppedDur = (segments[dropIdx].sourceOut - segments[dropIdx].sourceIn) / (segments[dropIdx].speed || 1.0);
        segments.splice(dropIdx, 1);
        currentDuration -= droppedDur;
      }
    }

    // If too short: expand segments or duplicate/extend high-scoring moments
    if (currentDuration < minTarget) {
      console.log(`[RuleEngine] Duration ${currentDuration.toFixed(1)}s below min ${minTarget.toFixed(1)}s. Expanding...`);
      for (let i = 0; i < segments.length; i++) {
        if (currentDuration >= minTarget) break;
        const seg = segments[i];
        const asset = assetMap.get(seg.assetId);
        const maxAssetDur = asset?.durationSeconds || 60;
        const speed = seg.speed || 1.0;
        const dur = (seg.sourceOut - seg.sourceIn) / speed;

        if (dur < 3.8 && seg.sourceOut < maxAssetDur) {
          const expandBy = Math.min(maxAssetDur - seg.sourceOut, minTarget - currentDuration);
          seg.sourceOut += expandBy;
          currentDuration += expandBy / speed;
        }
      }
    }

    return segments.map((s) => ({
      ...s,
      sourceIn: Number(s.sourceIn.toFixed(2)),
      sourceOut: Number(s.sourceOut.toFixed(2)),
    }));
  }

  /**
   * Rule 6:
   * Align cuts to music beats and movement onsets.
   */
  private alignCutsToMusicBeats(
    segments: GeminiSegment[],
    assetMap: Map<string, AssetQualityContext>,
    beats: number[]
  ): GeminiSegment[] {
    if (beats.length === 0 || segments.length <= 1) return segments;

    let timelineCursor = 0;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const asset = assetMap.get(seg.assetId);
      const maxAssetDur = asset?.durationSeconds || 60;
      const speed = seg.speed || 1.0;
      const originalDur = (seg.sourceOut - seg.sourceIn) / speed;
      const cutTime = timelineCursor + originalDur;

      // Find closest beat within +/- 0.35s
      let closestBeat = -1;
      let minDiff = 0.35;
      for (const b of beats) {
        const diff = Math.abs(b - cutTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestBeat = b;
        }
      }

      if (closestBeat > 0) {
        const targetDur = closestBeat - timelineCursor;
        if (targetDur >= 0.8 && targetDur <= 4.2) {
          const newOut = seg.sourceIn + targetDur * speed;
          if (newOut <= maxAssetDur) {
            seg.sourceOut = Number(newOut.toFixed(2));
            timelineCursor += targetDur;
            continue;
          }
        }
      }

      timelineCursor += (seg.sourceOut - seg.sourceIn) / speed;
    }

    return segments;
  }

  /**
   * Determines if a segment is bad (blurry, extreme shakiness, or bad exposure).
   */
  private isSegmentBad(seg: GeminiSegment, analysis: VideoAnalysisResult): boolean {
    const sStart = Math.floor(seg.sourceIn);
    const sEnd = Math.ceil(seg.sourceOut);

    // Check bad_segments array
    if (analysis.bad_segments && analysis.bad_segments.length > 0) {
      for (const bs of analysis.bad_segments) {
        if (Math.max(seg.sourceIn, bs.start) < Math.min(seg.sourceOut, bs.end)) {
          return true;
        }
      }
    }

    // Check per-second metrics
    if (analysis.seconds && analysis.seconds.length > 0) {
      const segSeconds = analysis.seconds.filter((s) => s.second >= sStart && s.second <= sEnd);
      if (segSeconds.length > 0) {
        const badCount = segSeconds.filter((s) => s.is_bad_shot || s.sharpness < 25 || s.shakiness > 0.08).length;
        if (badCount / segSeconds.length > 0.4) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Finds a clean window in an asset with good sharpness and no bad shots.
   */
  private findCleanWindow(
    asset: AssetQualityContext,
    desiredDur: number
  ): { start: number; end: number } | null {
    if (!asset.qualityAnalysis?.seconds || asset.qualityAnalysis.seconds.length === 0) {
      return null;
    }

    const dur = Math.max(1.0, Math.min(3.0, desiredDur));
    const goodSeconds = asset.qualityAnalysis.seconds
      .filter((s) => !s.is_bad_shot && !s.is_too_dark && s.sharpness > 40)
      .sort((a, b) => b.score - a.score);

    if (goodSeconds.length === 0) return null;

    const bestSec = goodSeconds[0].second;
    const start = Math.max(0, bestSec - 0.5);
    const end = Math.min(asset.durationSeconds, start + dur);

    return {
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
    };
  }

  /**
   * Checks if speech occurs continuously throughout the segment duration.
   */
  private isContinuousSpeech(seg: GeminiSegment, asset?: AssetQualityContext): boolean {
    if (!asset?.transcriptionSegments || asset.transcriptionSegments.length === 0) {
      return false;
    }

    const relevant = asset.transcriptionSegments.filter(
      (ts) => Math.max(seg.sourceIn, ts.start) < Math.min(seg.sourceOut, ts.end)
    );

    if (relevant.length === 0) return false;

    // Check for gaps > 0.6s between speech segments
    for (let i = 0; i < relevant.length - 1; i++) {
      if (relevant[i + 1].start - relevant[i].end > 0.6) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rule 7:
   * J-cuts (audio starts 0.3-0.5s before video cut) and L-cuts (audio lingers 0.3-0.5s after cut)
   * for natural dialog flow between speaking/audio scenes.
   */
  private assignJAndLCuts(
    segments: GeminiSegment[],
    assetMap: Map<string, AssetQualityContext>
  ): GeminiSegment[] {
    if (segments.length <= 1) return segments;

    return segments.map((seg, idx) => {
      if (idx === 0) return seg;
      const prev = segments[idx - 1];
      const curAsset = assetMap.get(seg.assetId);
      const prevAsset = assetMap.get(prev.assetId);

      const curHasSpeech =
        curAsset?.hasAudio &&
        curAsset?.transcriptionSegments &&
        curAsset.transcriptionSegments.length > 0;
      const prevHasSpeech =
        prevAsset?.hasAudio &&
        prevAsset?.transcriptionSegments &&
        prevAsset.transcriptionSegments.length > 0;

      // When transitioning into speech, apply a J-cut so incoming voice leads the cut
      if (curHasSpeech && !prevHasSpeech && seg.sourceIn >= 0.35) {
        return { ...seg, jCut: 0.35 };
      }
      // When transitioning out of speech, apply an L-cut so outgoing voice lingers naturally
      if (prevHasSpeech && !curHasSpeech && prev.sourceOut + 0.35 <= (prevAsset?.durationSeconds || 60)) {
        return { ...seg, lCut: 0.35 };
      }
      return seg;
    });
  }
}

export const ruleEngineService = new RuleEngineService();

