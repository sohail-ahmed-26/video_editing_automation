import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../services/apiClient';

export const ServicesSection: React.FC = () => {
  const [editKey, setEditKey] = useState('');
  const [editConnected, setEditConnected] = useState(false);
  const [isTestingEdit, setIsTestingEdit] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [footageKey, setFootageKey] = useState('');
  const [footageConnected, setFootageConnected] = useState(false);
  const [isTestingFootage, setIsTestingFootage] = useState(false);
  const [isSavingFootage, setIsSavingFootage] = useState(false);
  const [footageMessage, setFootageMessage] = useState<string | null>(null);
  const [footageError, setFootageError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const aiStatus = await apiClient.getAIStatus();
      setEditConnected(Boolean(aiStatus.online || aiStatus.hasKey));
    } catch {
      setEditConnected(false);
    }

    try {
      const stockStatus = await apiClient.getStockStatus();
      const hasAny = Boolean(
        stockStatus.pexels?.hasKey ||
        stockStatus.pixabay?.hasKey ||
        (stockStatus as any).connected ||
        (stockStatus as any).configured
      );
      setFootageConnected(hasAny);
    } catch {
      setFootageConnected(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTestAndSaveEdit = async (testOnly = false) => {
    const key = editKey.trim();
    if (!key) {
      setEditError('Please enter a key.');
      return;
    }
    setEditError(null);
    setEditMessage(null);
    if (testOnly) setIsTestingEdit(true);
    else setIsSavingEdit(true);

    try {
      const res = await apiClient.saveAIKey(key);
      if (res.success) {
        setEditConnected(true);
        setEditMessage(testOnly ? 'Key is valid.' : 'Key saved successfully.');
        if (!testOnly) setEditKey('');
      } else {
        setEditError(res.error || 'Verification failed.');
      }
    } catch (err: any) {
      setEditError(err?.message || 'Verification failed.');
    } finally {
      setIsTestingEdit(false);
      setIsSavingEdit(false);
    }
  };

  const handleTestAndSaveFootage = async (testOnly = false) => {
    const key = footageKey.trim();
    if (!key) {
      setFootageError('Please enter a key.');
      return;
    }
    setFootageError(null);
    setFootageMessage(null);
    if (testOnly) setIsTestingFootage(true);
    else setIsSavingFootage(true);

    try {
      // Test key against footage provider
      const testRes = await apiClient.testStockKey('pixabay', key);
      if (!testRes.valid) {
        // Try alternate provider check
        const testRes2 = await apiClient.testStockKey('pexels', key);
        if (!testRes2.valid) {
          setFootageError('Could not verify key with footage service.');
          return;
        }
        if (!testOnly) {
          await apiClient.saveStockKeys({ pexelsKey: key });
        }
      } else {
        if (!testOnly) {
          await apiClient.saveStockKeys({ pixabayKey: key });
        }
      }

      setFootageConnected(true);
      setFootageMessage(testOnly ? 'Key is valid.' : 'Key saved successfully.');
      if (!testOnly) setFootageKey('');
    } catch (err: any) {
      setFootageError(err?.message || 'Verification failed.');
    } finally {
      setIsTestingFootage(false);
      setIsSavingFootage(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-[#ECEDEF]">Services</h3>
        <p className="text-xs text-[#8B909A] mt-0.5">
          Connect external processing and media access keys. Keys are saved securely on your local system.
        </p>
      </div>

      <div className="space-y-5">
        {/* Edit service key */}
        <div className="p-4 rounded bg-[#121317] border border-[#23262D] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#ECEDEF]">Edit service key</span>
            <Badge variant={editConnected ? 'success' : 'neutral'} size="sm" dot>
              {editConnected ? 'Connected' : 'Not connected'}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <input
              type="password"
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="Paste edit service key"
              autoComplete="off"
              className="w-full bg-[#0B0C0E] border border-[#23262D] focus:border-[#C8A96A] text-[#ECEDEF] placeholder-[#5a5f6b] text-xs rounded px-3 py-2 outline-none font-mono"
            />
          </div>

          {editError && <p className="text-xs text-[#C75B5B]">{editError}</p>}
          {editMessage && (
            <p className="text-xs text-[#5FA37A] flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{editMessage}</span>
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTestAndSaveEdit(true)}
              isLoading={isTestingEdit}
              disabled={isSavingEdit}
            >
              Test
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleTestAndSaveEdit(false)}
              isLoading={isSavingEdit}
              disabled={isTestingEdit}
            >
              Save
            </Button>
          </div>
        </div>

        {/* Footage service key */}
        <div className="p-4 rounded bg-[#121317] border border-[#23262D] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#ECEDEF]">Footage service key</span>
            <Badge variant={footageConnected ? 'success' : 'neutral'} size="sm" dot>
              {footageConnected ? 'Connected' : 'Not connected'}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <input
              type="password"
              value={footageKey}
              onChange={(e) => setFootageKey(e.target.value)}
              placeholder="Paste footage service key"
              autoComplete="off"
              className="w-full bg-[#0B0C0E] border border-[#23262D] focus:border-[#C8A96A] text-[#ECEDEF] placeholder-[#5a5f6b] text-xs rounded px-3 py-2 outline-none font-mono"
            />
          </div>

          {footageError && <p className="text-xs text-[#C75B5B]">{footageError}</p>}
          {footageMessage && (
            <p className="text-xs text-[#5FA37A] flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{footageMessage}</span>
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTestAndSaveFootage(true)}
              isLoading={isTestingFootage}
              disabled={isSavingFootage}
            >
              Test
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleTestAndSaveFootage(false)}
              isLoading={isSavingFootage}
              disabled={isTestingFootage}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

