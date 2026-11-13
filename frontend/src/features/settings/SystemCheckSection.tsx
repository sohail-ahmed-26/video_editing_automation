import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../services/apiClient';

interface SystemItem {
  name: string;
  ok: boolean;
  statusText: string;
  fixTip: string;
}

export const SystemCheckSection: React.FC = () => {
  const [items, setItems] = useState<SystemItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const runCheck = async () => {
    setIsLoading(true);
    try {
      const check = await apiClient.getSystemCheck();

      const checkedItems: SystemItem[] = [
        {
          name: 'Video engine',
          ok: check['Video engine'] === 'ok',
          statusText: check['Video engine'] === 'ok' ? 'Operational' : 'Unavailable',
          fixTip: 'Verify video processing binary is accessible in environment path.',
        },
        {
          name: 'Speech',
          ok: check['Speech'] === 'ok',
          statusText: check['Speech'] === 'ok' ? 'Operational' : 'Unavailable',
          fixTip: 'Verify speech processing module is active in worker environment.',
        },
        {
          name: 'Photo cut-out',
          ok: check['Photo cut-out'] === 'ok',
          statusText: check['Photo cut-out'] === 'ok' ? 'Ready' : 'Model missing',
          fixTip: 'Place cut-out weights file into models directory.',
        },
        {
          name: 'Edit service',
          ok: check['Edit service'] === 'ok',
          statusText: check['Edit service'] === 'ok' ? 'Connected' : 'Not configured',
          fixTip: 'Paste and save Edit service key in the Services tab.',
        },
        {
          name: 'Footage service',
          ok: check['Footage service'] === 'ok',
          statusText: check['Footage service'] === 'ok' ? 'Connected' : 'Not configured',
          fixTip: 'Paste and save Footage service key in the Services tab.',
        },
        {
          name: 'Storage',
          ok: check['Storage'] === 'ok',
          statusText: check['Storage'] === 'ok' ? 'Ready' : 'Low space',
          fixTip: 'Clear temporary files in Storage and Backup tab.',
        },
        {
          name: 'Music',
          ok: check['Music'] === 'ok',
          statusText: check['Music'] === 'ok' ? 'Ready' : 'No tracks',
          fixTip: 'Upload audio files in the Music tab.',
        },
      ];

      setItems(checkedItems);
    } catch {
      setItems([
        {
          name: 'Video engine',
          ok: false,
          statusText: 'Check failed',
          fixTip: 'Ensure backend server is running.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#ECEDEF]">System Check</h3>
          <p className="text-xs text-[#8B909A] mt-0.5">
            Diagnostic status of workstation components.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={runCheck}
          isLoading={isLoading}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Check Now
        </Button>
      </div>

      <div className="divide-y divide-[#23262D] rounded border border-[#23262D] bg-[#121317]">
        {items.map((item) => (
          <div key={item.name} className="p-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#ECEDEF]">{item.name}</span>
                <Badge variant={item.ok ? 'success' : 'danger'} size="sm" dot>
                  {item.statusText}
                </Badge>
              </div>
              {!item.ok && (
                <p className="text-[11px] text-[#8B909A] mt-1">{item.fixTip}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
