import { FiChevronLeft, FiChevronRight, FiMapPin, FiCheck } from "react-icons/fi";
import { useState, useRef } from "react";

// Removed gradient helper since we are using images

function getInitials(name) {
  if (!name) return "B";
  const words = name.split(" ");
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function BranchCarousel({ branches, selectedBranch, onSelect }) {
  const scrollRef = useRef(null);

  const handlePrev = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -scrollRef.current.offsetWidth, behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: scrollRef.current.offsetWidth, behavior: 'smooth' });
    }
  };

  if (!branches || branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-500 bg-slate-800/30 rounded-2xl border border-slate-700/50 border-dashed w-full max-w-[800px] mx-auto">
        <FiMapPin className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm font-semibold">No branches available</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 md:gap-4 py-4 w-full max-w-[800px] mx-auto select-none">
      
      {/* Prev Arrow */}
      <button
        onClick={handlePrev}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 hover:bg-slate-800 text-blue-400 hover:text-blue-300 cursor-pointer active:scale-95 z-10"
      >
        <FiChevronLeft size={24} />
      </button>

      {/* Slider Container */}
      <div 
        ref={scrollRef}
        className="flex-1 flex gap-3 md:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {branches.map((b, idx) => {
          const branchName = b.branch || b.name || `Branch ${idx + 1}`;
          const isSelected = selectedBranch?.branch === branchName;
          
          return (
            <div
              key={branchName}
              onClick={() => onSelect(b)}
              className="cursor-pointer group relative flex-shrink-0 snap-start w-[180px] sm:w-[220px] md:w-[240px]"
            >
              {/* Card Container */}
              <div 
                className={`w-full aspect-[4/3] rounded-2xl flex items-center justify-center relative overflow-hidden transition-all duration-300
                  ${isSelected 
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 shadow-[0_8px_24px_rgba(59,130,246,0.3)] -translate-y-1' 
                    : 'border border-slate-700/50 shadow-lg group-hover:border-slate-600 group-hover:shadow-xl group-hover:-translate-y-1'
                  }`}
                style={{ backgroundColor: '#1e293b' }}
              >
                {/* Background Image */}
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110 opacity-60"
                  style={{ backgroundImage: `url(${b.image || 'https://picsum.photos/400/300'})` }}
                />
                
                {/* Gradient Overlay */}
                <div className={`absolute inset-0 transition-opacity duration-300
                  ${isSelected ? 'bg-blue-900/40' : 'bg-slate-900/60 group-hover:bg-slate-900/40'}
                `} />

                {/* Badge if selected */}
                {isSelected && (
                  <div className="absolute top-3 right-3 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 z-10">
                    <FiCheck size={12} /> Active
                  </div>
                )}
                
              </div>
              
              {/* Branch Label below the card */}
              <div className="mt-3 text-center transition-transform duration-300">
                <span className={`text-[11px] font-black tracking-wider uppercase px-4 py-1.5 rounded-full transition-colors duration-300
                  ${isSelected 
                    ? 'bg-blue-500/10 text-blue-400' 
                    : 'bg-slate-800/50 text-slate-300 group-hover:bg-slate-800 group-hover:text-white'
                  }`}
                >
                  {branchName}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Next Arrow */}
      <button
        onClick={handleNext}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 hover:bg-slate-800 text-blue-400 hover:text-blue-300 cursor-pointer active:scale-95 z-10"
      >
        <FiChevronRight size={24} />
      </button>

    </div>
  );
}
