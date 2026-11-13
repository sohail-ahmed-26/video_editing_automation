import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useSettings } from '../../store/SettingsContext';

export const EditDefaultsSection: React.FC = () => {
  const { settings, updateEditDefaults } = useSettings();
  const [savedSuccess, setSavedSuccess] = useState(false);

  const defaults = settings.editDefaults || {
    captions: true,
    captionStyle: 'clean',
    music: false,
    musicMood: 'chill',
    logo: false,
    silenceRemoval: true,
    speechAccuracy: 'high',
    speechLanguage: 'auto',
    visualUnderstanding: false,
  };

  const [captions, setCaptions] = useState(defaults.captions);
  const [captionStyle, setCaptionStyle] = useState<'viral' | 'clean' | 'minimal'>(defaults.captionStyle || 'clean');
  const [music, setMusic] = useState(defaults.music);
  const [musicMood, setMusicMood] = useState(defaults.musicMood || 'chill');
  const [logo, setLogo] = useState(defaults.logo);
  const [silenceRemoval, setSilenceRemoval] = useState(defaults.silenceRemoval);
  const [speechAccuracy, setSpeechAccuracy] = useState<'standard' | 'high'>(defaults.speechAccuracy || 'high');
  const [speechLanguage, setSpeechLanguage] = useState(defaults.speechLanguage || 'auto');
  const [visualUnderstanding, setVisualUnderstanding] = useState(defaults.visualUnderstanding ?? false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateEditDefaults({
      captions,
      captionStyle,
      music,
      musicMood,
      logo,
      silenceRemoval,
      speechAccuracy,
      speechLanguage,
      visualUnderstanding,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-[#ECEDEF]">Edit Defaults</h3>
        <p className="text-xs text-[#8B909A] mt-0.5">
          These default settings will apply to every new video edit.
        </p>
      </div>

      <div className="space-y-4">
        {/* Captions Toggle & Style */}
        <div className="p-3.5 rounded bg-[#121317] border border-[#23262D] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-[#ECEDEF]">Subtitles</span>
              <p className="text-[11px] text-[#8B909A]">Generate synchronized on-screen text</p>
            </div>
            <button
              type="button"
              onClick={() => setCaptions(!captions)}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                captions ? 'bg-[#C8A96A]' : 'bg-[#23262D]'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-[#0B0C0E] absolute top-0.5 transition-transform ${
                  captions ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {captions && (
            <div className="pt-2 border-t border-[#23262D] flex items-center gap-2">
              <span className="text-xs text-[#8B909A]">Style:</span>
              {(['clean', 'viral', 'minimal'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setCaptionStyle(style)}
                  className={`px-2.5 py-1 text-xs rounded border capitalize transition-colors ${
                    captionStyle === style
                      ? 'bg-[#181A1F] border-[#C8A96A] text-[#C8A96A]'
                      : 'border-[#23262D] text-[#8B909A] hover:text-[#ECEDEF]'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Music Toggle & Mood */}
        <div className="p-3.5 rounded bg-[#121317] border border-[#23262D] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-[#ECEDEF]">Background Music</span>
              <p className="text-[11px] text-[#8B909A]">Mix soundtrack beneath spoken audio</p>
            </div>
            <button
              type="button"
              onClick={() => setMusic(!music)}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                music ? 'bg-[#C8A96A]' : 'bg-[#23262D]'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-[#0B0C0E] absolute top-0.5 transition-transform ${
                  music ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {music && (
            <div className="pt-2 border-t border-[#23262D] flex items-center gap-2">
              <span className="text-xs text-[#8B909A]">Mood:</span>
              {['chill', 'energetic', 'dramatic', 'upbeat'].map((mood) => (
                <button
                  key={mood}
                  type="button"
                  onClick={() => setMusicMood(mood)}
                  className={`px-2.5 py-1 text-xs rounded border capitalize transition-colors ${
                    musicMood === mood
                      ? 'bg-[#181A1F] border-[#C8A96A] text-[#C8A96A]'
                      : 'border-[#23262D] text-[#8B909A] hover:text-[#ECEDEF]'
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Logo Watermark Toggle */}
        <div className="p-3.5 rounded bg-[#121317] border border-[#23262D] flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#ECEDEF]">Brand Logo Watermark</span>
            <p className="text-[11px] text-[#8B909A]">Overlay brand logo on final render</p>
          </div>
          <button
            type="button"
            onClick={() => setLogo(!logo)}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              logo ? 'bg-[#C8A96A]' : 'bg-[#23262D]'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-[#0B0C0E] absolute top-0.5 transition-transform ${
                logo ? 'right-1' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Silence Removal Toggle */}
        <div className="p-3.5 rounded bg-[#121317] border border-[#23262D] flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#ECEDEF]">Silence Removal</span>
            <p className="text-[11px] text-[#8B909A]">Automatically cut pauses longer than 0.4 seconds</p>
          </div>
          <button
            type="button"
            onClick={() => setSilenceRemoval(!silenceRemoval)}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              silenceRemoval ? 'bg-[#C8A96A]' : 'bg-[#23262D]'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-[#0B0C0E] absolute top-0.5 transition-transform ${
                silenceRemoval ? 'right-1' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Visual Understanding Toggle */}
        <div className="p-3.5 rounded bg-[#121317] border border-[#23262D] space-y-1.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-[#ECEDEF]">Visual Understanding</span>
              <p className="text-[11px] text-[#8B909A]">
                Sends sample frames to the edit service for scene context. Keep off for maximum privacy; local analysis will be used instead.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVisualUnderstanding(!visualUnderstanding)}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                visualUnderstanding ? 'bg-[#C8A96A]' : 'bg-[#23262D]'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-[#0B0C0E] absolute top-0.5 transition-transform ${
                  visualUnderstanding ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Speech Accuracy & Language */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8B909A]">
              Speech Accuracy
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['standard', 'high'] as const).map((acc) => (
                <button
                  key={acc}
                  type="button"
                  onClick={() => setSpeechAccuracy(acc)}
                  className={`px-3 py-2 text-xs rounded border capitalize transition-colors ${
                    speechAccuracy === acc
                      ? 'bg-[#181A1F] border-[#C8A96A] text-[#C8A96A]'
                      : 'bg-[#121317] border-[#23262D] text-[#8B909A] hover:text-[#ECEDEF]'
                  }`}
                >
                  {acc}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8B909A]">
              Speech Language
            </label>
            <select
              value={speechLanguage}
              onChange={(e) => setSpeechLanguage(e.target.value)}
              className="w-full bg-[#121317] border border-[#23262D] focus:border-[#C8A96A] text-[#ECEDEF] text-xs rounded px-3 py-2 outline-none"
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="hi">Hindi</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="primary" size="sm" type="submit">
          Save Edit Defaults
        </Button>
        {savedSuccess && (
          <span className="text-xs text-[#5FA37A] flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}
      </div>
    </form>
  );
};

