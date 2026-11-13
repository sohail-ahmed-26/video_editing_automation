import React, { useState, useMemo, DragEvent } from 'react';
import {
  Film,
  Image as ImageIcon,
  Search,
  Trash2,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '../../store/WorkspaceContext';
import { ProjectMediaItem } from '../../types/media';
import { formatBytes, formatSimpleDuration } from '../../utils/formatters';
import { apiClient } from '../../services/apiClient';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export const MediaLibrary: React.FC = () => {
  const {
    mediaItems,
    activeMediaItem,
    selectMediaItemForPreview,
    deleteMediaItem,
    reorderMediaItems,
    addMediaItemToTimeline,
  } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'photo'>('all');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ProjectMediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedLicenseItem, setSelectedLicenseItem] = useState<{ item: ProjectMediaItem; license: any } | null>(null);
  const [isLoadingLicense, setIsLoadingLicense] = useState(false);

  const handleOpenLicense = async (item: ProjectMediaItem) => {
    if (item.stockLicense) {
      setSelectedLicenseItem({ item, license: item.stockLicense });
      return;
    }
    setIsLoadingLicense(true);
    try {
      const lic = await apiClient.getAssetLicense(item.id);
      setSelectedLicenseItem({ item, license: lic });
    } catch {
      setSelectedLicenseItem({ item, license: null });
    } finally {
      setIsLoadingLicense(false);
    }
  };

  // Filter and search items
  const filteredItems = useMemo(() => {
    return mediaItems.filter((item) => {
      const isPhoto = !!item.isPhoto;
      if (filterType === 'video' && isPhoto) return false;
      if (filterType === 'photo' && !isPhoto) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = (item.originalName || item.filename).toLowerCase();
        return name.includes(query);
      }
      return true;
    });
  }, [mediaItems, filterType, searchQuery]);

  // Counts for filter pills
  const totalCount = mediaItems.length;
  const videoCount = mediaItems.filter((m) => !m.isPhoto).length;
  const photoCount = mediaItems.filter((m) => !!m.isPhoto).length;

  // Drag and drop reordering handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...mediaItems];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setDraggedIndex(null);
    setDragOverIndex(null);
    await reorderMediaItems(reordered);
  };

  const handleMove = async (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= mediaItems.length) return;

    const reordered = [...mediaItems];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    await reorderMediaItems(reordered);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteMediaItem(itemToDelete.id);
      setItemToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl overflow-hidden shadow-studio">
      {/* Header Bar */}
      <div className="p-4 bg-studio-card/80 border-b border-studio-border flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Media Library</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-studio-surface border border-studio-border text-violet-300">
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </span>
        </div>

        {/* Search & Filter Controls in One Straight Line */}
        <div className="flex items-center gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-studio-subtle pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-36 sm:w-44 pl-8 pr-2.5 py-1 text-xs bg-studio-surface border border-studio-border rounded-lg text-studio-text placeholder-studio-subtle focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center bg-studio-surface border border-studio-border rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setFilterType('video')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === 'video'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              Videos ({videoCount})
            </button>
            <button
              onClick={() => setFilterType('photo')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === 'photo'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              Photos ({photoCount})
            </button>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="p-4">
        {filteredItems.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <p className="text-sm font-medium text-studio-text">
              {searchQuery || filterType !== 'all' ? 'No matching media files' : 'No media in this project yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {filteredItems.map((item, index) => {
              const isActive = activeMediaItem?.id === item.id;
              const isDragTarget = dragOverIndex === index;
              const isBeingDragged = draggedIndex === index;
              const isStockMedia = Boolean(
                item.stockLicense ||
                item.filename?.startsWith('stock_') ||
                item.originalName?.toUpperCase().includes('PEXELS') ||
                item.originalName?.toUpperCase().includes('PIXABAY')
              );
              const thumbUrl = item.thumbnailUrl
                ? apiClient.getVideoFileUrl(item.thumbnailUrl)
                : item.isPhoto && item.previewUrl
                ? apiClient.getVideoFileUrl(item.previewUrl)
                : null;

              return (
                <div
                  key={item.id}
                  draggable={true}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(index)}
                  className={`group relative bg-studio-card border rounded-xl overflow-hidden flex flex-col transition-all select-none ${
                    isActive
                      ? 'border-violet-500 ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/10'
                      : 'border-studio-border hover:border-violet-500/50 hover:shadow-studio-sm'
                  } ${isDragTarget ? 'border-amber-400 bg-amber-500/5 scale-[1.02]' : ''} ${
                    isBeingDragged ? 'opacity-40' : ''
                  }`}
                >
                  {/* Thumbnail Banner */}
                  <div
                    onClick={() => selectMediaItemForPreview(item)}
                    className="relative aspect-video bg-black/60 cursor-pointer overflow-hidden flex items-center justify-center"
                    title="Click to preview in Preview Monitor"
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.originalName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-studio-surface/50 text-studio-subtle">
                        {item.isPhoto ? <ImageIcon className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                      </div>
                    )}

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none gap-1">
                      {/* Media Type */}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm ${
                          item.isPhoto
                            ? 'bg-emerald-500/90 text-white'
                            : 'bg-violet-600/90 text-white'
                        }`}
                      >
                        {item.isPhoto ? 'Photo' : 'Video'}
                      </span>

                      {/* Preview Status Badge */}
                      {item.previewStatus === 'preparing' ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/90 text-white shadow-sm">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Preparing</span>
                        </span>
                      ) : item.previewStatus === 'error' ? (
                        <span
                          className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/90 text-white shadow-sm"
                          title={item.previewError || 'Preview failed'}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-600/90 text-white shadow-sm">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Ready</span>
                        </span>
                      )}
                    </div>

                    {/* Bottom Duration Badge */}
                    <div className="absolute bottom-2 right-2 pointer-events-none">
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-black/80 text-white">
                        {item.isPhoto ? '5.0s' : formatSimpleDuration(item.durationSeconds || 0)}
                      </span>
                    </div>

                    {/* Active Monitor Indicator Overlay */}
                    {isActive && (
                      <div className="absolute inset-0 bg-violet-600/10 pointer-events-none border-b-2 border-violet-500 flex items-center justify-center">
                        <div className="px-2 py-0.5 rounded bg-violet-600/90 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                          <Play className="w-3 h-3 fill-current" />
                          <span>In Monitor</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Content & Details */}
                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <h4
                          onClick={() => selectMediaItemForPreview(item)}
                          className="text-xs font-semibold text-studio-text hover:text-white truncate cursor-pointer flex-1"
                          title={item.originalName || item.filename}
                        >
                          {item.originalName || item.filename}
                        </h4>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 text-[10px] text-studio-muted font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span>
                            {item.width && item.height
                              ? `${item.width}×${item.height}`
                              : item.isPhoto
                              ? 'Photo'
                              : '1080p'}
                          </span>
                          <span>•</span>
                          <span>{formatBytes(item.fileSizeBytes)}</span>
                        </div>
                        {isStockMedia && (
                          <button
                            type="button"
                            onClick={() => handleOpenLicense(item)}
                            className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded transition-colors shrink-0"
                            title="View stock creator and license info"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>License</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-studio-border/60 flex items-center justify-between gap-1">
                      {/* Add to Timeline Button */}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addMediaItemToTimeline(item)}
                        leftIcon={<Plus className="w-3 h-3 text-emerald-400" />}
                        className="text-[11px] py-1 px-2 h-7"
                        title="Add this clip to the V1 track on the timeline"
                      >
                        Add to Timeline
                      </Button>

                      <div className="flex items-center gap-0.5">
                        {/* Move Left */}
                        <button
                          type="button"
                          onClick={() => handleMove(index, 'left')}
                          disabled={index === 0}
                          className="p-1 rounded text-studio-muted hover:text-white hover:bg-studio-surface disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          title="Move Left in order"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>

                        {/* Move Right */}
                        <button
                          type="button"
                          onClick={() => handleMove(index, 'right')}
                          disabled={index === mediaItems.length - 1}
                          className="p-1 rounded text-studio-muted hover:text-white hover:bg-studio-surface disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          title="Move Right in order"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="p-1 rounded text-studio-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-0.5"
                          title="Delete this file from project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setItemToDelete(null)}
          title="Delete Media File"
          description="Are you sure you want to permanently delete this media asset?"
          maxWidth="sm"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmDelete}
                isLoading={isDeleting}
                className="bg-rose-600 hover:bg-rose-500 text-white"
              >
                Delete File
              </Button>
            </>
          }
        >
          <div className="space-y-3 py-2 text-xs text-studio-muted">
            <p>
              This will remove <strong className="text-white font-mono">{itemToDelete.originalName || itemToDelete.filename}</strong> from your project, delete the raw file and preview copy from disk, and remove any corresponding timeline clips.
            </p>
            <p className="text-[11px] text-amber-300/80 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
              This action cannot be undone.
            </p>
          </div>
        </Modal>
      )}

      {/* Stock Media License Modal */}
      {selectedLicenseItem && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLicenseItem(null)}
          title="Stock Media License Details"
          description="Source attribution and copyright terms for this asset."
          maxWidth="md"
          footer={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedLicenseItem(null)}
            >
              Close
            </Button>
          }
        >
          <div className="space-y-4 py-2 text-xs">
            {isLoadingLicense ? (
              <div className="flex items-center justify-center p-8 text-studio-muted gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Loading license metadata...</span>
              </div>
            ) : selectedLicenseItem.license ? (
              <div className="space-y-3 bg-studio-card/80 p-4 rounded-xl border border-studio-border">
                <div className="flex items-center justify-between border-b border-studio-border/60 pb-2">
                  <span className="text-studio-muted font-medium">Source Provider</span>
                  <span className="font-semibold text-emerald-400 uppercase tracking-wide">
                    {selectedLicenseItem.license.source || 'Stock Media'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-studio-border/60 pb-2">
                  <span className="text-studio-muted font-medium">Creator / Photographer</span>
                  {selectedLicenseItem.license.creatorUrl ? (
                    <a
                      href={selectedLicenseItem.license.creatorUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white hover:text-emerald-300 font-medium inline-flex items-center gap-1"
                    >
                      <span>{selectedLicenseItem.license.creatorName || 'Contributor'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-white font-medium">
                      {selectedLicenseItem.license.creatorName || 'Contributor'}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between border-b border-studio-border/60 pb-2">
                  <span className="text-studio-muted font-medium">Original Page</span>
                  <a
                    href={selectedLicenseItem.license.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-400 hover:text-violet-300 font-medium inline-flex items-center gap-1 truncate max-w-[240px]"
                  >
                    <span>View original media</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <div className="flex items-center justify-between border-b border-studio-border/60 pb-2">
                  <span className="text-studio-muted font-medium">License Terms</span>
                  <a
                    href={selectedLicenseItem.license.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1"
                  >
                    <span>{selectedLicenseItem.license.licenseName || 'Free to use commercially'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between text-studio-muted pt-1">
                  <span>Imported On</span>
                  <span className="font-mono">
                    {selectedLicenseItem.license.importedAt
                      ? new Date(selectedLicenseItem.license.importedAt).toLocaleDateString()
                      : 'Recently'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-studio-card/80 rounded-xl border border-studio-border text-center space-y-2">
                <p className="text-studio-muted">
                  No explicit stock license sidecar found for this file. It was uploaded directly or imported as a local asset.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

