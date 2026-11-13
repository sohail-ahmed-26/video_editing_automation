import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Sliders,
  Layers,
  Download,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  FolderDown,
  Film,
  Maximize2,
  Upload,
  Crop,
  Sun,
  Palette,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { BeforeAfterSlider } from '../../components/photo/BeforeAfterSlider';
import {
  apiClient,
  PhotoPlan,
  PhotoAnalysisData,
  PhotoEditResult,
  PhotoVersionSummary,
} from '../../services/apiClient';
import { useWorkspace } from '../../store/WorkspaceContext';
import { formatBytes } from '../../utils/formatters';

interface PhotoFrameOption {
  id: string;
  name: string;
  platform: string;
  aspectRatio: string;
  width: number;
  height: number;
  badge: string;
}

const PHOTO_FRAME_OPTIONS: PhotoFrameOption[] = [
  {
    id: 'yt-thumbnail',
    name: 'YouTube Thumbnail',
    platform: 'YouTube Thumbnail 16:9',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    badge: '16:9 (1920x1080)',
  },
  {
    id: 'ig-post-square',
    name: 'Instagram Post',
    platform: 'Instagram Post 1:1',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    badge: '1:1 (1080x1080)',
  },
  {
    id: 'ig-post-portrait',
    name: 'Instagram Portrait',
    platform: 'Instagram Portrait 4:5',
    aspectRatio: '4:5',
    width: 1080,
    height: 1350,
    badge: '4:5 (1080x1350)',
  },
  {
    id: 'story-reel-cover',
    name: 'Story / Reel Cover',
    platform: 'Story/Reel Cover 9:16',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    badge: '9:16 (1080x1920)',
  },
];

const EXAMPLE_PROMPTS = [
  'Vivid Instagram Post with Brand Logo',
  'Clean YouTube Thumbnail with Removed Background',
  'Warm Portrait with Soft Vignette',
  'Cinematic Reel Cover',
];

interface PhotoEditingWorkspaceProps {
  projectId?: string;
  onPhotoImportedToVideo?: () => void;
}

export const PhotoEditingWorkspace: React.FC<PhotoEditingWorkspaceProps> = ({
  projectId: propProjectId,
  onPhotoImportedToVideo,
}) => {
  const { currentProjectId, mediaItems, uploadMultipleFiles, uploadQueue } = useWorkspace();
  const projectId = propProjectId || currentProjectId || '';

  // Filter project photos
  const photoAssets = mediaItems.filter(
    (item) => item.isPhoto || (item.mimeType && item.mimeType.startsWith('image/'))
  );

  // Selected photo for editing
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedFrame, setSelectedFrame] = useState<PhotoFrameOption>(PHOTO_FRAME_OPTIONS[0]);
  const [prompt, setPrompt] = useState<string>('');

  // Generation & Execution State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [processError, setProcessError] = useState<string | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Result State
  const [activeResult, setActiveResult] = useState<PhotoEditResult | null>(null);
  const [analysisData, setAnalysisData] = useState<PhotoAnalysisData | null>(null);
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null);

  // Quick Adjustments State
  const [showAdjustments, setShowAdjustments] = useState<boolean>(true);
  const [brightness, setBrightness] = useState<number>(1.0);
  const [contrast, setContrast] = useState<number>(1.0);
  const [saturation, setSaturation] = useState<number>(1.0);
  const [selectedFilter, setSelectedFilter] = useState<string>('none');
  const [bgMode, setBgMode] = useState<string>('keep');
  const [bgColor, setBgColor] = useState<string>('#FFFFFF');
  const [bgColor2, setBgColor2] = useState<string>('#111827');
  const [vignette, setVignette] = useState<boolean>(false);
  const [brandLogo, setBrandLogo] = useState<boolean>(false);
  const [overlayText, setOverlayText] = useState<string>('');

  // Versions State
  const [versions, setVersions] = useState<PhotoVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // Batch Processing State
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Use in Video State
  const [isImportingToVideo, setIsImportingToVideo] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);

  // File dropzone
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Auto-select first photo if none selected
  useEffect(() => {
    if (!selectedAssetId && photoAssets.length > 0) {
      const first = photoAssets[0];
      setSelectedAssetId(first.id);
      const url = first.previewUrl || first.publicUrl || '';
      setOriginalPhotoUrl(url);
    }
  }, [photoAssets, selectedAssetId]);

  // Sync selected photo original URL
  useEffect(() => {
    if (selectedAssetId) {
      const found = photoAssets.find((p) => p.id === selectedAssetId);
      if (found) {
        setOriginalPhotoUrl(found.previewUrl || found.publicUrl || '');
      }
    }
  }, [selectedAssetId, photoAssets]);

  // Load versions on mount
  useEffect(() => {
    if (projectId) {
      apiClient
        .getPhotoVersions(projectId)
        .then((vList) => {
          setVersions(vList);
          if (vList.length > 0) {
            setSelectedVersion(vList[0].version);
          }
        })
        .catch((err) => console.warn('Could not load photo versions:', err));
    }
  }, [projectId]);

  // Synchronize adjustment controls when a plan is loaded or generated
  const syncAdjustmentsFromPlan = (plan: PhotoPlan) => {
    setBrightness(plan.brightness ?? 1.0);
    setContrast(plan.contrast ?? 1.0);
    setSaturation(plan.saturation ?? 1.0);
    setSelectedFilter(plan.filter ?? 'none');
    setBgMode(plan.background?.mode ?? 'keep');
    setBgColor(plan.background?.color ?? '#FFFFFF');
    setBgColor2(plan.background?.color2 ?? '#111827');
    setVignette(Boolean(plan.vignette));
    setBrandLogo(Boolean(plan.brand_logo?.enabled));
    setOverlayText(plan.text_overlay?.text ?? '');
  };

  // Generate Edit
  const handleGenerateEdit = async () => {
    if (!selectedAssetId) {
      setProcessError('Please select a photo from your Media Library first.');
      return;
    }

    setIsProcessing(true);
    setProcessError(null);
    setEditSuccessMsg(null);
    setImportSuccess(false);

    try {
      setProcessingStage('Analyzing photo & detecting subjects...');
      const planRes = await apiClient.generatePhotoPlan(projectId, {
        assetId: selectedAssetId,
        userPrompt: prompt,
        frame: selectedFrame.aspectRatio,
      });

      setAnalysisData(planRes.analysis);
      syncAdjustmentsFromPlan(planRes.plan);

      setProcessingStage('Executing edits: smart crop, filters & background processing...');
      const editRes = await apiClient.executePhotoEdit(projectId, {
        assetId: selectedAssetId,
        plan: planRes.plan,
        targetFormat: planRes.plan.output_format || 'jpg',
      });

      setActiveResult(editRes);
      setEditSuccessMsg(`Photo edited successfully! Version: ${editRes.version}`);

      // Refresh versions
      const vList = await apiClient.getPhotoVersions(projectId);
      setVersions(vList);
      if (vList.length > 0) {
        setSelectedVersion(editRes.version);
      }
    } catch (err: any) {
      console.error('Photo edit error:', err);
      setProcessError(err.message || 'Failed to process photo edit');
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  // Apply Quick Adjustments (Direct re-execution without calling planner)
  const handleApplyAdjustments = async () => {
    if (!selectedAssetId) return;

    setIsProcessing(true);
    setProcessError(null);
    setEditSuccessMsg(null);

    try {
      setProcessingStage('Re-rendering photo with updated adjustments...');

      // Construct updated plan
      const currentPlan: PhotoPlan = activeResult?.plan || {
        summary: 'Manual Quick Adjustments',
        explanation: 'Updated parameters applied directly',
        frame: {
          platform: selectedFrame.platform,
          aspectRatio: selectedFrame.aspectRatio,
          width: selectedFrame.width,
          height: selectedFrame.height,
        },
      };

      const updatedPlan: PhotoPlan = {
        ...currentPlan,
        brightness,
        contrast,
        saturation,
        filter: selectedFilter as any,
        background: {
          mode: bgMode as any,
          color: bgColor,
          color2: bgColor2,
        },
        vignette,
        brand_logo: {
          enabled: brandLogo,
          position: 'bottom-right',
          opacity: 0.9,
          size_percent: 15,
        },
        text_overlay: overlayText ? { text: overlayText, position: 'bottom', color: '#FFFFFF' } : null,
      };

      const editRes = await apiClient.executePhotoEdit(projectId, {
        assetId: selectedAssetId,
        plan: updatedPlan,
        targetFormat: updatedPlan.output_format || 'jpg',
      });

      setActiveResult(editRes);
      setEditSuccessMsg(`Updated version created: ${editRes.version}`);

      const vList = await apiClient.getPhotoVersions(projectId);
      setVersions(vList);
      setSelectedVersion(editRes.version);
    } catch (err: any) {
      console.error('Adjustment apply error:', err);
      setProcessError(err.message || 'Failed to apply adjustments');
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  // Batch Process All Selected / Project Photos
  const handleBatchProcess = async () => {
    if (photoAssets.length === 0) {
      setProcessError('No photos found in project to batch process.');
      return;
    }

    setIsBatchProcessing(true);
    setProcessError(null);
    setEditSuccessMsg(null);
    setBatchProgress({ current: 0, total: photoAssets.length });

    try {
      // Use active plan or base template
      const basePlan: PhotoPlan = activeResult?.plan || {
        summary: 'Batch Auto Enhance',
        explanation: 'Automated smart crop and enhancement applied across batch',
        frame: {
          platform: selectedFrame.platform,
          aspectRatio: selectedFrame.aspectRatio,
          width: selectedFrame.width,
          height: selectedFrame.height,
        },
        auto_levels: true,
        brightness,
        contrast,
        saturation,
        filter: selectedFilter as any,
        background: { mode: bgMode as any, color: bgColor, color2: bgColor2 },
        vignette,
        brand_logo: {
          enabled: brandLogo,
          position: 'bottom-right',
          opacity: 0.9,
          size_percent: 15,
        },
      };

      const assetIds = photoAssets.map((p) => p.id);
      const batchRes = await apiClient.executeBatchPhotoEdit(projectId, {
        assetIds,
        plan: basePlan,
      });

      setEditSuccessMsg(`Batch completed! ${batchRes.count} photos processed.`);

      const vList = await apiClient.getPhotoVersions(projectId);
      setVersions(vList);
      if (batchRes.results.length > 0) {
        setActiveResult(batchRes.results[0]);
        setSelectedVersion(batchRes.results[0].version);
      }
    } catch (err: any) {
      console.error('Batch process error:', err);
      setProcessError(err.message || 'Failed to complete batch edit');
    } finally {
      setIsBatchProcessing(false);
      setBatchProgress(null);
    }
  };

  // Use in Video Project
  const handleUseInVideo = async () => {
    if (!activeResult) return;

    setIsImportingToVideo(true);
    setImportSuccess(false);

    try {
      await apiClient.usePhotoInVideo(projectId, {
        editedPhotoPath: activeResult.filePath,
        originalName: activeResult.filename,
      });

      setImportSuccess(true);
      if (onPhotoImportedToVideo) {
        onPhotoImportedToVideo();
      }
    } catch (err: any) {
      console.error('Use in video error:', err);
      setProcessError(err.message || 'Failed to import photo into video project');
    } finally {
      setIsImportingToVideo(false);
    }
  };

  // Handle Drag & Drop photo upload
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadMultipleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadMultipleFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full pb-16">
      {/* Step 1: Upload Box for Photos */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600/30 text-violet-300 font-bold text-xs border border-violet-500/30">
              1
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              Upload Photos
            </h2>
          </div>
          <span className="text-xs text-studio-muted">
            Supports JPG, PNG, WEBP, HEIC, HEIF
          </span>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-violet-500 bg-violet-950/20 shadow-lg shadow-violet-500/10'
              : 'border-studio-border hover:border-studio-subtle bg-studio-card/60 hover:bg-studio-card'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            multiple
            accept="image/*,.heic,.heif"
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                Drag and drop your photos here, or <span className="text-violet-400 underline">browse</span>
              </p>
              <p className="text-xs text-studio-muted mt-0.5">
                Upload single photos or multiple photos for batch editing
              </p>
            </div>
          </div>
        </div>

        {/* Upload Queue Progress */}
        {uploadQueue.length > 0 && (
          <div className="bg-studio-card border border-studio-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-studio-muted uppercase tracking-wider">
              Uploading Files
            </p>
            {uploadQueue.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex justify-between text-xs text-white">
                  <span className="truncate max-w-[70%]">{item.name}</span>
                  <span className="text-violet-400 font-mono">{item.progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-studio-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Step 2: Photo Library Selection */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600/30 text-violet-300 font-bold text-xs border border-violet-500/30">
              2
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              Select Photo to Edit
            </h2>
          </div>
          <span className="text-xs text-studio-muted">
            {photoAssets.length} photo{photoAssets.length === 1 ? '' : 's'} available
          </span>
        </div>

        {photoAssets.length === 0 ? (
          <div className="bg-studio-card/40 border border-studio-border rounded-xl p-8 text-center text-studio-muted">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No photos uploaded yet. Drop photos above to start.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {photoAssets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              const imgUrl = asset.previewUrl || asset.publicUrl || '';
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className={`relative group rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 aspect-square ${
                    isSelected
                      ? 'border-violet-500 ring-2 ring-violet-500/40 shadow-lg shadow-violet-500/20'
                      : 'border-studio-border hover:border-studio-subtle bg-studio-card/80'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={asset.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5">
                    <p className="text-[11px] font-medium text-white truncate" title={asset.originalName}>
                      {asset.originalName}
                    </p>
                    {asset.width && asset.height && (
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {asset.width}x{asset.height}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center shadow">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 3: Frame Selection */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600/30 text-violet-300 font-bold text-xs border border-violet-500/30">
            3
          </span>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            Choose Target Frame
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PHOTO_FRAME_OPTIONS.map((frame) => {
            const isSelected = selectedFrame.id === frame.id;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => setSelectedFrame(frame)}
                className={`p-3.5 rounded-xl border text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-violet-500 bg-violet-950/30 ring-1 ring-violet-500 shadow-md shadow-violet-500/10'
                    : 'border-studio-border hover:border-studio-subtle bg-studio-card/80 hover:bg-studio-card'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-white">{frame.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-violet-400" />}
                </div>
                <div className="text-[11px] font-mono text-zinc-400">{frame.badge}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 4: Prompt & Generate */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600/30 text-violet-300 font-bold text-xs border border-violet-500/30">
            4
          </span>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            Describe Your Edit (or Pick an Example)
          </h2>
        </div>

        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Clean YouTube thumbnail, remove busy background, make vibrant with high contrast and brand logo..."
            rows={3}
            className="w-full bg-studio-card border border-studio-border rounded-xl p-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Generate Edit & Batch Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleGenerateEdit}
            disabled={isProcessing || !selectedAssetId}
            leftIcon={
              isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />
            }
            className="shadow-lg shadow-violet-600/20"
          >
            {isProcessing ? processingStage || 'Processing...' : 'Generate Photo Edit'}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={handleBatchProcess}
            disabled={isBatchProcessing || isProcessing || photoAssets.length === 0}
            leftIcon={
              isBatchProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4 text-violet-400" />
              )
            }
          >
            {isBatchProcessing
              ? `Batch Processing (${batchProgress?.current || 0}/${batchProgress?.total || photoAssets.length})...`
              : `Batch Edit All Photos (${photoAssets.length})`}
          </Button>
        </div>

        {/* Messages & Alerts */}
        {processError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{processError}</span>
          </div>
        )}

        {editSuccessMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{editSuccessMsg}</span>
          </div>
        )}
      </section>

      {/* Step 5: Result Area with Before/After Slider & Adjustments */}
      {activeResult && originalPhotoUrl && (
        <section className="space-y-6 pt-4 border-t border-studio-border">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600/30 text-violet-300 font-bold text-xs border border-violet-500/30">
                5
              </span>
              <h2 className="text-base font-bold uppercase tracking-wider text-white">
                Finished Photo & Comparison
              </h2>
            </div>

            {/* Version Switcher */}
            {versions.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-studio-muted">Version:</span>
                <select
                  value={selectedVersion}
                  onChange={(e) => {
                    const ver = e.target.value;
                    setSelectedVersion(ver);
                    const foundVer = versions.find((v) => v.version === ver);
                    if (foundVer && foundVer.files.length > 0) {
                      const f = foundVer.files[0];
                      setActiveResult({
                        version: ver,
                        filename: f.filename,
                        filePath: f.filePath,
                        fileUrl: f.fileUrl,
                        width: f.width,
                        height: f.height,
                        format: f.filename.split('.').pop()?.toUpperCase() || 'JPG',
                        fileSizeBytes: f.fileSizeBytes,
                        operations: activeResult.operations,
                        plan: activeResult.plan,
                        createdAt: foundVer.createdAt,
                      });
                    }
                  }}
                  className="bg-studio-card border border-studio-border rounded-md px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version} ({v.fileCount} file{v.fileCount === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Interactive Before / After Comparison Slider */}
          <div className="space-y-2">
            <BeforeAfterSlider
              beforeUrl={originalPhotoUrl}
              afterUrl={activeResult.fileUrl}
              beforeLabel="ORIGINAL"
              afterLabel={`EDITED (${activeResult.width}x${activeResult.height})`}
            />
            <p className="text-[11px] text-center text-studio-muted">
              Drag the center slider left or right to inspect changes
            </p>
          </div>

          {/* Plan Breakdown & Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-studio-card border border-studio-border rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">
                Plan Summary
              </span>
              <p className="text-xs font-semibold text-white">
                {activeResult.plan.summary || 'Auto Enhanced'}
              </p>
              <p className="text-[11px] text-zinc-400">
                {activeResult.plan.explanation || 'Clean crop and enhancement applied'}
              </p>
            </div>

            <div className="bg-studio-card border border-studio-border rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">
                Operations Applied
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {activeResult.operations.map((op, idx) => (
                  <Badge key={idx} variant="violet" className="text-[10px] py-0 px-1.5">
                    {op}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="bg-studio-card border border-studio-border rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">
                Export File Info
              </span>
              <p className="text-xs font-mono text-zinc-300 truncate">
                {activeResult.filename}
              </p>
              <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                <span>{activeResult.width}x{activeResult.height}</span>
                <span>{activeResult.format}</span>
                <span>{formatBytes(activeResult.fileSizeBytes)}</span>
              </div>
            </div>
          </div>

          {/* Quick Adjustments Panel */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-4">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowAdjustments(!showAdjustments)}
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Quick Adjustments</h3>
                <span className="text-xs text-studio-muted">(tweak and re-render instantly)</span>
              </div>
              {showAdjustments ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </div>

            {showAdjustments && (
              <div className="space-y-4 pt-2 border-t border-studio-border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Brightness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300">Brightness</span>
                      <span className="font-mono text-violet-300">
                        {Math.round((brightness - 1.0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300">Contrast</span>
                      <span className="font-mono text-violet-300">
                        {Math.round((contrast - 1.0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.05"
                      value={contrast}
                      onChange={(e) => setContrast(parseFloat(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300">Saturation</span>
                      <span className="font-mono text-violet-300">
                        {Math.round((saturation - 1.0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="2.5"
                      step="0.1"
                      value={saturation}
                      onChange={(e) => setSaturation(parseFloat(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {/* Color Filter */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-300 block">Artistic Filter</label>
                    <select
                      value={selectedFilter}
                      onChange={(e) => setSelectedFilter(e.target.value)}
                      className="w-full bg-studio-bg border border-studio-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="none">None (Natural)</option>
                      <option value="warm">Warm Glow</option>
                      <option value="cool">Cool Tone</option>
                      <option value="vintage">Vintage Sepia</option>
                      <option value="black_and_white">Black & White</option>
                      <option value="cinematic">Cinematic Teal & Orange</option>
                      <option value="vivid">Vivid & Saturated</option>
                    </select>
                  </div>

                  {/* Background Mode */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-300 block">Background</label>
                    <select
                      value={bgMode}
                      onChange={(e) => setBgMode(e.target.value)}
                      className="w-full bg-studio-bg border border-studio-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="keep">Keep Original</option>
                      <option value="remove">Remove (Transparent PNG)</option>
                      <option value="solid">Solid Color</option>
                      <option value="gradient">2-Color Gradient</option>
                      <option value="blur">Blurred Background</option>
                    </select>
                  </div>

                  {/* Background Color Pickers if solid or gradient */}
                  {bgMode === 'solid' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-300 block">Solid Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="w-8 h-8 rounded border border-studio-border bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-mono text-zinc-300">{bgColor}</span>
                      </div>
                    </div>
                  )}

                  {bgMode === 'gradient' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-300 block">Gradient Colors</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="w-8 h-8 rounded border border-studio-border bg-transparent cursor-pointer"
                        />
                        <input
                          type="color"
                          value={bgColor2}
                          onChange={(e) => setBgColor2(e.target.value)}
                          className="w-8 h-8 rounded border border-studio-border bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Additional Toggles */}
                <div className="flex flex-wrap items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vignette}
                      onChange={(e) => setVignette(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>Vignette (Corner Darkening)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={brandLogo}
                      onChange={(e) => setBrandLogo(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>Brand Kit Logo Overlay</span>
                  </label>
                </div>

                {/* Apply Adjustments Button */}
                <div className="pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleApplyAdjustments}
                    disabled={isProcessing}
                    leftIcon={isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-violet-400" />}
                  >
                    Apply Adjustments
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons: Download, Download ZIP, Use in Video */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={activeResult.fileUrl}
              download={activeResult.filename}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-studio-card hover:bg-studio-border border border-studio-border text-xs font-semibold text-white transition-colors"
            >
              <Download className="w-4 h-4 text-violet-400" />
              <span>Download Photo</span>
            </a>

            <a
              href={apiClient.getPhotoDownloadZipUrl(projectId, selectedVersion || activeResult.version)}
              download={`${selectedVersion || activeResult.version}_bundle.zip`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-studio-card hover:bg-studio-border border border-studio-border text-xs font-semibold text-white transition-colors"
            >
              <FolderDown className="w-4 h-4 text-emerald-400" />
              <span>Download All as ZIP</span>
            </a>

            <Button
              variant="outline"
              size="sm"
              onClick={handleUseInVideo}
              disabled={isImportingToVideo}
              leftIcon={
                isImportingToVideo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : importSuccess ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Film className="w-3.5 h-3.5 text-violet-400" />
                )
              }
            >
              {importSuccess ? 'Added to Video Library!' : 'Use in Video Project'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};
