import React, { useState, useRef, useCallback } from 'react';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className = '',
}) => {
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage 0 - 100
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percent);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  }, [handleMove]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleMove(e.clientX);
    }
  }, [isDragging, handleMove]);

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-xl border border-studio-border bg-black/40 ${className}`}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
    >
      {/* After Image (Full background) */}
      <img
        src={afterUrl}
        alt="After edit"
        className="w-full h-auto max-h-[540px] object-contain block pointer-events-none mx-auto"
        draggable={false}
      />

      {/* Before Image (Clipped overlay) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeUrl}
          alt="Before edit"
          className="w-full h-auto max-h-[540px] object-contain block pointer-events-none mx-auto"
          style={{
            width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
            maxWidth: 'none',
          }}
          draggable={false}
        />
      </div>

      {/* Vertical Slider Handle Divider */}
      <div
        className="absolute top-0 bottom-0 z-20 cursor-ew-resize flex items-center justify-center pointer-events-auto"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setIsDragging(true);
        }}
      >
        <div className="w-0.5 h-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
        <div className="absolute w-7 h-7 rounded-full bg-white shadow-lg border border-studio-border flex items-center justify-center text-zinc-900 select-none">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 3 12 9 6" />
            <polyline points="15 6 21 12 15 18" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-10 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-mono text-zinc-300 pointer-events-none border border-white/10">
        {beforeLabel}
      </div>
      <div className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded bg-violet-950/80 backdrop-blur-sm text-[11px] font-mono text-violet-200 pointer-events-none border border-violet-500/30">
        {afterLabel}
      </div>
    </div>
  );
};

