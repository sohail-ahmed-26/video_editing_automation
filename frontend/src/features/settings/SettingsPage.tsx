import React, { useState } from 'react';
import { Check, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useSettings } from '../../store/SettingsContext';
import { DEFAULT_SYSTEM_PROMPT } from '../../services/settingsStorage';

export const SettingsPage: React.FC = () => {
  const { settings, updateSystemPrompt } = useSettings();
  const [promptText, setPromptText] = useState(settings.systemPrompt || DEFAULT_SYSTEM_PROMPT);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSystemPrompt(promptText.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    setPromptText(DEFAULT_SYSTEM_PROMPT);
    updateSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="w-full max-w-5xl p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="border-b border-[#23262D] pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#ECEDEF] tracking-tight">Settings</h1>
          <p className="text-xs text-[#8B909A] mt-1">
            Director AI system prompt instructions for automated editing and styling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
              <Check className="w-3.5 h-3.5" />
              Saved!
            </span>
          )}
        </div>
      </div>

      {/* Main Settings Card: System Prompt */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="bg-[#121317] border border-[#23262D] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#23262D]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#C8A96A]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#ECEDEF]">System Prompt</h3>
                <p className="text-xs text-[#8B909A]">
                  Autonomous editing instructions and rules applied to every project.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-[#8B909A] hover:text-[#ECEDEF] flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#23262D] hover:bg-[#181A1F] transition-colors"
              title="Reset to default prompt"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Default
            </button>
          </div>

          <div className="space-y-1.5">
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={18}
              spellCheck={false}
              className="w-full bg-[#0B0C0E] border border-[#23262D] focus:border-[#C8A96A] text-[#ECEDEF] font-mono text-xs leading-relaxed rounded-lg p-4 outline-none transition-colors resize-y"
              placeholder="Enter director AI system prompt..."
            />
            <div className="flex items-center justify-between text-[11px] text-[#8B909A] px-1">
              <span>Plain text prompt instructions sent to director engine.</span>
              <span className="font-mono">{promptText.length} characters</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#23262D]">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              leftIcon={<Check className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
