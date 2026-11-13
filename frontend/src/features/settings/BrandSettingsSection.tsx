import React, { useState, useEffect } from 'react';
import { Upload, Trash2, Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Slider } from '../../components/ui/Slider';
import { apiClient } from '../../services/apiClient';

export const BrandSettingsSection: React.FC = () => {
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#C8A96A');
  const [secondaryColor, setSecondaryColor] = useState('#ECEDEF');
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');
  const [watermarkOpacity, setWatermarkOpacity] = useState(80);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const loadBrandKit = async () => {
      try {
        const kit = await apiClient.getBrandKit();
        setBrandName(kit.brandName || '');
        if (kit.primaryColor) setPrimaryColor(kit.primaryColor);
        if (kit.secondaryColor) setSecondaryColor(kit.secondaryColor);
        if (kit.watermarkPosition) setWatermarkPosition(kit.watermarkPosition);
        if (kit.watermarkOpacity !== undefined) setWatermarkOpacity(kit.watermarkOpacity);
        if (kit.logoUrl) {
          setLogoUrl(apiClient.getVideoFileUrl(kit.logoUrl));
        }
      } catch (err) {
        console.warn('Could not load brand kit:', err);
      }
    };
    loadBrandKit();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const res = await apiClient.uploadBrandLogo(file);
      setLogoUrl(apiClient.getVideoFileUrl(res.logoUrl));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: any) {
      alert('Failed to upload logo: ' + (err?.message || 'Error'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await apiClient.deleteBrandLogo();
      setLogoUrl(null);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: any) {
      alert('Failed to delete logo: ' + (err?.message || 'Error'));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await apiClient.updateBrandKit({
        brandName: brandName.trim(),
        primaryColor,
        secondaryColor,
        watermarkPosition: watermarkPosition as any,
        watermarkOpacity,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: any) {
      alert('Failed to save brand settings: ' + (err?.message || 'Error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-[#ECEDEF]">Brand Settings</h3>
        <p className="text-xs text-[#8B909A] mt-0.5">
          Configure default logo, colors, and watermark placement.
        </p>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[#8B909A]">
          Brand Logo
        </label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded bg-[#0B0C0E] border border-[#23262D] flex items-center justify-center overflow-hidden p-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[10px] text-[#5a5f6b] text-center">No logo</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#23262D] bg-[#121317] hover:bg-[#181A1F] text-[#ECEDEF] transition-colors">
              <Upload className="w-3.5 h-3.5 text-[#8B909A]" />
              <span>{isUploading ? 'Uploading...' : 'Upload logo'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="inline-flex items-center gap-1 text-[11px] text-[#C75B5B] hover:underline"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove logo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Brand Name */}
      <Input
        label="Brand Name"
        value={brandName}
        onChange={(e) => setBrandName(e.target.value)}
        placeholder="Enter brand name"
      />

      {/* Colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[#8B909A]">
            Primary Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-8 h-8 rounded border border-[#23262D] bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="flex-1 bg-[#121317] border border-[#23262D] rounded px-3 py-1.5 text-xs text-[#ECEDEF] font-mono focus:border-[#C8A96A] outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[#8B909A]">
            Secondary Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-8 h-8 rounded border border-[#23262D] bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="flex-1 bg-[#121317] border border-[#23262D] rounded px-3 py-1.5 text-xs text-[#ECEDEF] font-mono focus:border-[#C8A96A] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Logo Position */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-[#8B909A]">
          Logo Position
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'top-left', label: 'Top Left' },
            { id: 'top-right', label: 'Top Right' },
            { id: 'bottom-left', label: 'Bottom Left' },
            { id: 'bottom-right', label: 'Bottom Right' },
          ].map((pos) => (
            <button
              key={pos.id}
              type="button"
              onClick={() => setWatermarkPosition(pos.id)}
              className={`px-3 py-2 text-xs rounded border text-center transition-colors ${
                watermarkPosition === pos.id
                  ? 'bg-[#181A1F] border-[#C8A96A] text-[#C8A96A]'
                  : 'bg-[#121317] border-[#23262D] text-[#8B909A] hover:text-[#ECEDEF]'
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logo Opacity */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-[#8B909A]">
          <span>Logo Opacity</span>
          <span className="font-mono text-[#ECEDEF]">{watermarkOpacity}%</span>
        </div>
        <Slider
          value={watermarkOpacity}
          onChange={setWatermarkOpacity}
          min={10}
          max={100}
          step={5}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="primary" size="sm" type="submit" isLoading={isSaving}>
          Save Brand Settings
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

