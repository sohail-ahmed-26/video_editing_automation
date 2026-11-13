import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Trash2,
  Archive,
  AlertTriangle,
  FolderArchive,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { apiClient, StorageOverviewReport, BackupResult } from '../../services/apiClient';
import { formatBytes } from '../../utils/formatters';

export const SystemStorageSection: React.FC = () => {
  const [storage, setStorage] = useState<StorageOverviewReport | null>(null);
  const [backups, setBackups] = useState<BackupResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [cleaning, setCleaning] = useState(false);
  const [cleanSuccess, setCleanSuccess] = useState<string | null>(null);
  const [cleanError, setCleanError] = useState<string | null>(null);

  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const fetchStorage = async () => {
    try {
      const data = await apiClient.getStorageOverview();
      setStorage(data);
    } catch (err: any) {
      console.error('Failed to load storage overview:', err);
    }
  };

  const fetchBackups = async () => {
    try {
      const list = await apiClient.listBackups();
      setBackups(list);
    } catch (err: any) {
      console.error('Failed to load backups list:', err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchStorage(), fetchBackups()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCleanCache = async () => {
    setCleaning(true);
    setCleanSuccess(null);
    setCleanError(null);
    try {
      const res = await apiClient.cleanCache();
      setCleanSuccess(`Freed ${res.freedMb.toFixed(1)} MB (${res.deletedFiles} files removed).`);
      await fetchStorage();
    } catch (err: any) {
      setCleanError(err.message || 'Failed to clean cache');
    } finally {
      setCleaning(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupSuccess(null);
    setBackupError(null);
    try {
      const res = await apiClient.createBackup();
      setBackupSuccess(`Backup created: ${res.fileName} (${formatBytes(res.sizeBytes)})`);
      await fetchBackups();
    } catch (err: any) {
      setBackupError(err.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#ECEDEF]">Storage and Backup</h3>
          <p className="text-xs text-[#8B909A] mt-0.5">
            Manage local disk storage, cache cleanup, and project backups.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadAll}
          isLoading={loading}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh
        </Button>
      </div>

      {/* Disk Space Overview */}
      {storage && (
        <div className="p-4 rounded bg-[#121317] border border-[#23262D] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#ECEDEF]">Disk Space</span>
            <span className="font-mono text-xs text-[#8B909A]">
              {storage.disk.freeGb} GB free of {storage.disk.totalGb} GB
            </span>
          </div>

          <div className="w-full bg-[#0B0C0E] border border-[#23262D] rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                storage.disk.warning ? 'bg-[#C75B5B]' : 'bg-[#C8A96A]'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(5, ((storage.disk.totalGb - storage.disk.freeGb) / storage.disk.totalGb) * 100)
                )}%`,
              }}
            />
          </div>

          {storage.disk.warning && (
            <div className="p-2.5 rounded bg-[#C75B5B]/10 border border-[#C75B5B]/30 flex items-center gap-2 text-xs text-[#C75B5B]">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Low disk space warning: less than 10 GB available.</span>
            </div>
          )}
        </div>
      )}

      {/* Cache & Temp Cleanup */}
      {storage && (
        <div className="p-4 rounded bg-[#121317] border border-[#23262D] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#ECEDEF]">Temporary Files & Cache</span>
              <p className="text-[11px] text-[#8B909A] mt-0.5">
                Cleanable temporary files: {storage.cacheCleanableMb.toFixed(1)} MB
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanCache}
              isLoading={cleaning}
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-[#C75B5B]" />}
            >
              Clean Cache
            </Button>
          </div>

          {cleanSuccess && (
            <p className="text-xs text-[#5FA37A] flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{cleanSuccess}</span>
            </p>
          )}
          {cleanError && <p className="text-xs text-[#C75B5B]">{cleanError}</p>}
        </div>
      )}

      {/* Project Backups */}
      <div className="p-4 rounded bg-[#121317] border border-[#23262D] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#ECEDEF]">Project Backups</span>
            <p className="text-[11px] text-[#8B909A] mt-0.5">
              Create a portable archive of all client files and metadata.
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateBackup}
            isLoading={creatingBackup}
            leftIcon={<Archive className="w-3.5 h-3.5 text-[#0B0C0E]" />}
          >
            Create Backup
          </Button>
        </div>

        {backupSuccess && (
          <p className="text-xs text-[#5FA37A] flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            <span>{backupSuccess}</span>
          </p>
        )}
        {backupError && <p className="text-xs text-[#C75B5B]">{backupError}</p>}

        <div className="pt-2 border-t border-[#23262D]">
          <span className="text-[11px] font-medium text-[#8B909A] uppercase tracking-wider">
            Available Backups ({backups.length})
          </span>

          {backups.length === 0 ? (
            <p className="text-xs text-[#5a5f6b] mt-2">No backups created yet.</p>
          ) : (
            <div className="divide-y divide-[#23262D] mt-2">
              {backups.map((b) => (
                <div key={b.fileName} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FolderArchive className="w-3.5 h-3.5 text-[#C8A96A]" />
                    <span className="font-mono text-[#ECEDEF]">{b.fileName}</span>
                  </div>
                  <span className="font-mono text-[#8B909A]">{formatBytes(b.sizeBytes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
