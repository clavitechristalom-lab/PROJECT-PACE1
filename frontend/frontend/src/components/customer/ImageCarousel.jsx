import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtimeSync';
import { useAuth } from '../../context/AuthContext';

export default function ImageCarousel() {
  const { user } = useAuth();
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const branchDisplay = user?.branch_name ? `${user.branch_name}` : '';

  const fetchImages = async (source) => {
    try {
      const data = await api.carouselImages.getActive();
      setImages(data || []);
    } catch (err) {
      console.error('Failed to load carousel images', err);
    }
  };

  useEffect(() => {
    fetchImages('initial');
  }, []);

  useRealtimeSync(fetchImages, []);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000); // 5 seconds auto-slide
    return () => clearInterval(interval);
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="relative w-full h-[250px] sm:h-[350px] md:h-[400px] rounded-2xl overflow-hidden shadow-sm mb-6 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700">
        <div className="text-center text-slate-400 dark:text-slate-500 p-6">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium mb-1">Welcome to {branchDisplay}</h3>
          <p className="text-sm">Exciting deals and products will be featured here soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[250px] sm:h-[350px] md:h-[400px] rounded-2xl overflow-hidden shadow-lg mb-6 group">
      {images.map((img, index) => (
        <div
          key={img.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
        >
          <img
            src={img.image_url}
            alt="Promotional Banner"
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
