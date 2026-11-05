import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiImage } from 'react-icons/fi';
import { api } from '../../lib/api';
import { useRealtimeSync, fastDeepEqual } from '../../lib/realtimeSync';
import { useAuth } from '../../context/AuthContext';

export default function ImageCarousel() {
  const { user } = useAuth();
  const [images, setImages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_carousel_images');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const inFlightRef = useRef(false);

  const branchDisplay = user?.branch_name ? `${user.branch_name}` : 'Z-Lics Iligan';

  const normalizeImg = (url) => {
    if (!url) return '';
    const str = String(url).trim();
    if (str.includes('/storage/')) return str.substring(str.indexOf('/storage/'));
    return str;
  };

  const fetchImages = useCallback(async (_silent = false, signal) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const data = await api.carouselImages.getActive({ signal });
      if (signal?.aborted) return;
      const list = data || [];
      setImages(prev => {
        if (fastDeepEqual(prev, list)) return prev;
        try {
          sessionStorage.setItem('pace_cached_carousel_images', JSON.stringify(list));
        } catch (e) {}
        return list;
      });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to load carousel images', err);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchImages(false);
  }, [fetchImages]);

  useRealtimeSync(fetchImages, [fetchImages]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000); // 5 seconds auto-slide
    return () => clearInterval(interval);
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="relative w-full h-[200px] sm:h-[260px] md:h-[300px] rounded-[2.5rem] overflow-hidden shadow-xs flex items-center justify-center bg-blue-50/40 dark:bg-slate-900/40 border border-dashed border-blue-200/70 dark:border-blue-900/50 transition-all">
        <div className="text-center text-slate-400 dark:text-slate-500 p-6">
          <FiImage className="w-16 h-16 mx-auto mb-3 text-blue-400/40 dark:text-blue-500/40" />
          <h3 className="text-lg sm:text-xl font-bold text-slate-700 dark:text-slate-300 mb-1">Welcome to {branchDisplay}</h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Exciting deals and products will be featured here soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[220px] sm:h-[300px] md:h-[340px] rounded-[2.5rem] overflow-hidden shadow-md group border border-border/60">
      {images.map((img, index) => (
        <div
          key={img.id}
          className={`absolute inset-0 transition-opacity duration-300 ${index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
        >
          <img
            src={normalizeImg(img.image_url)}
            alt="Promotional Banner"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
        </div>
      ))}

      {/* Navigation Dots */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/80'
                }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Promotional overlay text */}
      <div className="absolute bottom-10 left-6 right-6 z-20 text-white">
        <h2 className="text-2xl sm:text-3xl font-extrabold mb-1 drop-shadow-md">Welcome to {branchDisplay}</h2>
        <p className="text-sm sm:text-base opacity-90 drop-shadow max-w-xl">Discover our latest appliances and furniture with flexible installment plans.</p>
      </div>
    </div>
  );
}
