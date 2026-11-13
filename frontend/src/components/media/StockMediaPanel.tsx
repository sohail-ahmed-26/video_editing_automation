import React, { useState, useEffect } from 'react';
import {
  Search,
  Film,
  Image as ImageIcon,
  ExternalLink,
  Plus,
  Check,
  Loader2,
  AlertTriangle,
  Globe,
  Settings,
  Play,
  X,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  apiClient,
  StockItem,
  StockMediaType,
  StockSource,
  StockOrientation,
  StockStatusResponse,
} from '../../services/apiClient';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useWorkspace } from '../../store/WorkspaceContext';
import { formatSimpleDuration } from '../../utils/formatters';
import { Link } from 'react-router-dom';

interface StockMediaPanelProps {
  currentAspectRatio?: string;
  projectId?: string;
  onImportSuccess?: () => void;
}

export const StockMediaPanel: React.FC<StockMediaPanelProps> = ({
  currentAspectRatio = '16:9',
  projectId: propProjectId,
  onImportSuccess,
}) => {
  const { currentProjectId: workspaceProjectId } = useWorkspace();
  const projectId = propProjectId || workspaceProjectId;

  // Search parameters
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<StockMediaType>('video');
  const [source, setSource] = useState<StockSource>('all');

  // Derive orientation from frame aspect ratio
  const getDefaultOrientation = (aspect: string): StockOrientation => {
    if (aspect === '9:16' || aspect === '4:5') return 'portrait';
    if (aspect === '1:1') return 'square';
    return 'landscape';
  };

  const [orientation, setOrientation] = useState<StockOrientation>(
    getDefaultOrientation(currentAspectRatio)
  );

  // When frame changes, update orientation default if user hasn't overridden
  useEffect(() => {
    setOrientation(getDefaultOrientation(currentAspectRatio));
  }, [currentAspectRatio]);

  // Results & status state
  const [items, setItems] = useState<StockItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);

  // Key status
  const [stockStatus, setStockStatus] = useState<StockStatusResponse | null>(null);
  const [hasAnyKey, setHasAnyKey] = useState(true);

  // Import state
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);

  // Preview modal
  const [previewItem, setPreviewItem] = useState<StockItem | null>(null);

  // Check API keys status on mount
  useEffect(() => {
    const checkKeys = async () => {
      try {
        const s = await apiClient.getStockStatus();
        setStockStatus(s);
        const configured = s.pexels.configured || s.pixabay.configured;
        setHasAnyKey(configured);
      } catch (err) {
        console.warn('Could not query stock status:', err);
      }
    };
    checkKeys();
  }, []);

  const handleSearch = async (targetPage = 1) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setSearchError(null);
    setRateLimitWarning(null);

    try {
      const res = await apiClient.searchStock({
        q: trimmed,
        type: mediaType,
        source,
        orientation,
        page: targetPage,
        perPage: 12,
      });

      setItems(res.items);
      setPage(res.page);
      setTotalHits(res.totalHits);
      setHasSearched(true);
      if (res.rateLimitWarning) {
        setRateLimitWarning(res.rateLimitWarning);
      }
    } catch (err: any) {
      setSearchError(err.message || 'Failed to search stock media');
      setItems([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async (item: StockItem) => {
    if (!projectId) {
      setImportError('No active project found to import into.');
      return;
    }

    setImportingIds((prev) => new Set(prev).add(item.id));
    setImportError(null);

    try {
      await apiClient.importStockMedia(projectId, item);
      setImportedIds((prev) => new Set(prev).add(item.id));

      // Refresh workspace media library if callback provided
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err: any) {
      setImportError(`Import failed: ${err.message || 'Network error'}`);
    } finally {
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const totalPages = Math.min(20, Math.ceil(totalHits / 12));

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl overflow-hidden shadow-studio space-y-4 p-4 md:p-5">
      {/* Missing Keys Banner */}
      {!hasAnyKey && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Footage service key not configured.</strong> Add your key in Settings to search extra footage.
            </span>
          </div>
          <Link to="/settings?tab=services">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 text-amber-300 border-amber-500/40 hover:bg-amber-500/20 shrink-0"
            >
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Configure Service
            </Button>
          </Link>
        </div>
      )}

      {/* Rate limit warning */}
      {rateLimitWarning && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{rateLimitWarning}</span>
        </div>
      )}

      {/* Search Header & Controls */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(1);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-studio-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search free stock b-roll (e.g. aerial drone coast, coffee shop, tech coding)..."
              className="w-full pl-9 pr-3 py-2 bg-studio-card border border-studio-border rounded-lg text-xs text-white placeholder-studio-muted focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSearching || !query.trim()}
            className="shrink-0 flex items-center gap-1.5"
          >
            {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Search Stock</span>
          </Button>
        </form>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-studio-border/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Media Type Toggle */}
            <div className="flex items-center bg-studio-card p-0.5 rounded-lg border border-studio-border">
              <button
                type="button"
                onClick={() => setMediaType('video')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  mediaType === 'video'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-studio-muted hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Videos</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaType('photo')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  mediaType === 'photo'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-studio-muted hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Photos</span>
              </button>
            </div>

            {/* Source Dropdown */}
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as StockSource)}
              className="bg-studio-card border border-studio-border text-studio-text rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="all">All sources</option>
              <option value="pexels">Source 1</option>
              <option value="pixabay">Source 2</option>
            </select>

            {/* Orientation Dropdown */}
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as StockOrientation)}
              className="bg-studio-card border border-studio-border text-studio-text rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-violet-500"
            >
              <option value="landscape">Landscape (16:9)</option>
              <option value="portrait">Portrait (9:16 / 4:5)</option>
              <option value="square">Square (1:1)</option>
              <option value="all">Any Orientation</option>
            </select>
          </div>

          {/* Quick hit count */}
          {hasSearched && (
            <span className="text-[11px] text-studio-muted font-mono">
              Found {totalHits} items
            </span>
          )}
        </div>
      </div>

      {/* Global Import Error Banner */}
      {importError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center justify-between">
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="text-rose-400 hover:text-rose-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search Error Banner */}
      {searchError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Grid of Results */}
      {isSearching ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          <p className="text-xs text-studio-muted">
            Searching footage for "{query}"...
          </p>
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((item) => {
              const isImporting = importingIds.has(item.id);
              const isImported = importedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="group bg-studio-card border border-studio-border hover:border-violet-500/50 rounded-xl overflow-hidden flex flex-col transition-all shadow-sm"
                >
                  {/* Thumbnail / Preview Area */}
                  <div
                    onClick={() => setPreviewItem(item)}
                    className="relative aspect-video bg-black/40 cursor-pointer overflow-hidden"
                  >
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />

                    {/* Source Badge */}
                    <div className="absolute top-2 left-2 pointer-events-none">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow ${
                          item.source === 'pexels'
                            ? 'bg-emerald-600/90 text-white'
                            : 'bg-sky-600/90 text-white'
                        }`}
                      >
                        {item.source}
                      </span>
                    </div>

                    {/* Duration / Dimensions Badge */}
                    <div className="absolute bottom-2 right-2 pointer-events-none">
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-black/80 text-white">
                        {item.type === 'video'
                          ? formatSimpleDuration(item.durationSeconds || 0)
                          : `${item.width}×${item.height}`}
                      </span>
                    </div>

                    {/* Hover Play / View Overlay */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="p-2 rounded-full bg-violet-600/90 text-white shadow-lg">
                        {item.type === 'video' ? (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Content & Action */}
                  <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-0.5">
                      <h5
                        onClick={() => setPreviewItem(item)}
                        className="text-xs font-semibold text-studio-text hover:text-white truncate cursor-pointer"
                        title={item.title}
                      >
                        {item.title}
                      </h5>
                      <div className="flex items-center justify-between text-[10px] text-studio-muted">
                        <a
                          href={item.creatorUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-emerald-400 truncate max-w-[120px] transition-colors"
                          title={`By ${item.creatorName}`}
                        >
                          by {item.creatorName}
                        </a>
                        <a
                          href={item.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-white transition-colors"
                          title="View on source site"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>

                    {/* Add to Project Button */}
                    <Button
                      type="button"
                      variant={isImported ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => handleImport(item)}
                      disabled={isImporting || isImported}
                      className={`w-full text-[11px] py-1 h-7 flex items-center justify-center gap-1 ${
                        isImported
                          ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                          : ''
                      }`}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Importing...</span>
                        </>
                      ) : isImported ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Added to Project</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3 text-emerald-400" />
                          <span>Add to Project</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-studio-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSearch(page - 1)}
                disabled={page <= 1 || isSearching}
                className="h-7 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-studio-muted font-mono px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSearch(page + 1)}
                disabled={page >= totalPages || isSearching}
                className="h-7 text-xs"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      ) : hasSearched ? (
        <div className="py-12 text-center text-studio-muted text-xs space-y-1">
          <p className="font-semibold text-white">No results found for "{query}".</p>
          <p>Try searching for a simpler keyword or changing the orientation filter.</p>
        </div>
      ) : (
        <div className="py-12 text-center text-studio-muted text-xs space-y-2">
          <div className="w-10 h-10 rounded-full bg-studio-card border border-studio-border flex items-center justify-center mx-auto text-studio-subtle">
            <Globe className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="font-medium text-studio-text">
            Search millions of free stock clips & photos
          </p>
          <p className="text-[11px] max-w-sm mx-auto text-studio-muted">
            Search for cinematic b-roll, background textures, or theme footage. Imported assets are automatically licensed and added to your project.
          </p>
        </div>
      )}

      {/* Preview Lightbox Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="bg-studio-card border border-studio-border rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl space-y-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant={previewItem.source === 'pexels' ? 'emerald' : 'blue'}
                  className="uppercase text-[10px]"
                >
                  {previewItem.source}
                </Badge>
                <h4 className="text-sm font-semibold text-white truncate max-w-md">
                  {previewItem.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1 rounded text-studio-muted hover:text-white hover:bg-studio-surface transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Media Player */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {previewItem.type === 'video' ? (
                <video
                  src={previewItem.previewVideoUrl || previewItem.downloadUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={previewItem.downloadUrl}
                  alt={previewItem.title}
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            {/* Footer Details & Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs">
              <div className="space-y-0.5">
                <p className="text-studio-muted">
                  Creator:{' '}
                  <a
                    href={previewItem.creatorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white hover:text-emerald-400 font-medium inline-flex items-center gap-1"
                  >
                    <span>{previewItem.creatorName}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
                <p className="text-[11px] text-studio-muted flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Free commercial license from {previewItem.source.toUpperCase()}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewItem(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleImport(previewItem);
                    setPreviewItem(null);
                  }}
                  disabled={importedIds.has(previewItem.id) || importingIds.has(previewItem.id)}
                  className="flex items-center gap-1"
                >
                  {importedIds.has(previewItem.id) ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Added to Project</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Add to Project</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
