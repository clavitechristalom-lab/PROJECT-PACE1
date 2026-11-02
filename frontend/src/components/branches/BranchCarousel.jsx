import { FiChevronLeft, FiChevronRight, FiMapPin, FiCheck } from "react-icons/fi";
import { useState, useRef, useEffect } from "react";

function getInitials(name) {
  if (!name) return "B";
  const words = name.trim().split(/\s+/);
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Cleanly separates the branch name and the city location code for centered pill badges.
 */
function parseBranchInfo(branchObj) {
  const rawName = (branchObj.branch || branchObj.name || '').trim();
  const rawLoc = (branchObj.location || '').trim();

  let companyName = rawName;
  let cityName = '';

  const cdoRegex = /(.*?)(?:[-–—\s/]+)(C\.?D\.?O\.?|CDO|CAGAYAN DE ORO)(?:\s+CITY)?$/i;
  const iliganRegex = /(.*?)(?:[-–—\s/]+)(ILIGAN)(?:\s+CITY)?$/i;
  const depologRegex = /(.*?)(?:[-–—\s/]+)(DEPOLOG|DIPOLOG)(?:\s+CITY)?$/i;

  const mCdo = rawName.match(cdoRegex);
  const mIligan = rawName.match(iliganRegex);
  const mDepolog = rawName.match(depologRegex);

  if (mCdo) {
    companyName = mCdo[1].replace(/[/\\-]+$/, '').trim();
    cityName = 'C.D.O';
  } else if (mIligan) {
    companyName = mIligan[1].replace(/[/\\-]+$/, '').trim();
    cityName = 'ILIGAN';
  } else if (mDepolog) {
    companyName = mDepolog[1].replace(/[/\\-]+$/, '').trim();
    cityName = 'DEPOLOG';
  } else if (rawLoc) {
    cityName = rawLoc.toUpperCase().replace(/\s+CITY$/i, '').trim();
  }

  if (!cityName && rawName.includes(' ')) {
    const parts = rawName.split(' ');
    cityName = parts.pop().toUpperCase();
    companyName = parts.join(' ');
  }

  return {
    companyName: (companyName || rawName).toUpperCase(),
    cityName: (cityName || 'MAIN').toUpperCase(),
  };
}

function normalizeImageUrl(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (str.includes('/storage/')) {
    return str.substring(str.indexOf('/storage/'));
  }
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }
  return str.startsWith('/') ? str : `/storage/${str}`;
}

export default function BranchCarousel({ branches, selectedBranch, onSelect }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [imgErrors, setImgErrors] = useState({});

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  };

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [branches]);

  const handlePrev = () => {
    if (scrollRef.current) {
      const card = scrollRef.current.firstElementChild;
      const step = card ? card.offsetWidth + 16 : scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({ left: -step, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  const handleNext = () => {
    if (scrollRef.current) {
      const card = scrollRef.current.firstElementChild;
      const step = card ? card.offsetWidth + 16 : scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({ left: step, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  if (!branches || branches.length === 0) {
    return (
      <div className="w-full relative flex items-center gap-2 sm:gap-3.5 select-none py-1">
        <div className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-card dark:bg-[#0F172A] border border-border dark:border-slate-800 opacity-30" />
        <div className="flex-1 min-w-0 flex gap-3 sm:gap-4 md:gap-5 py-2">
          {[1, 2].map((i) => (
            <div key={i} className="shrink-0" style={{ width: '8.22cm', height: '5.44cm' }}>
              <div
                className="w-full h-full rounded-2xl bg-card dark:bg-[#0F172A] border border-border dark:border-slate-800 animate-pulse"
                style={{ width: '8.22cm', height: '5.44cm' }}
              />
            </div>
          ))}
        </div>
        <div className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-card dark:bg-[#0F172A] border border-border dark:border-slate-800 opacity-30" />
      </div>
    );
  }

  const isFew = branches.length <= 3;

  return (
    <div className="w-full relative flex items-center gap-2 sm:gap-3.5 select-none py-1">

      {/* Prev Arrow - outer left edge, vertically centered */}
      <button
        type="button"
        onClick={handlePrev}
        disabled={!canScrollLeft}
        aria-label="Previous Branch"
        className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl bg-card dark:bg-[#0F172A] border border-border dark:border-slate-800 hover:bg-muted dark:hover:bg-slate-800 text-foreground dark:text-white transition-all shadow-xs hover:shadow cursor-pointer active:scale-95 disabled:opacity-20 disabled:cursor-default disabled:hover:bg-card dark:disabled:hover:bg-[#0F172A] z-10"
      >
        <FiChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Slider Container - Edge to Edge between arrows */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex-1 min-w-0 flex gap-3 sm:gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory no-scrollbar py-2 scroll-smooth items-center"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {branches.map((b, idx) => {
          const rawName = b.branch || b.name || `Branch ${idx + 1}`;
          const isSelected = selectedBranch?.branch === rawName || selectedBranch?.id === b.id;
          const { companyName, cityName } = parseBranchInfo(b);
          const rawImage = b.image || b.image_url;
          const imageSrc = normalizeImageUrl(rawImage);
          const hasImgError = imgErrors[b.id || idx];

          return (
            <div
              key={b.id || rawName}
              onClick={() => onSelect(b)}
              className="cursor-pointer group relative shrink-0 snap-start transition-all"
              style={{ width: '8.22cm', height: '5.44cm', maxWidth: '100%' }}
            >
              {/* Card Container - Identical aspect ratio and height with corner-to-corner image fit */}
              <div
                className={`w-full h-full image-card rounded-2xl flex items-center justify-center relative overflow-hidden bg-slate-900 shadow-md transition-all duration-300
                  ${isSelected
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background dark:ring-offset-[#0B1120] shadow-lg shadow-blue-500/25 border-transparent'
                    : 'border border-border/80 dark:border-slate-800 group-hover:border-blue-500/60 group-hover:shadow-lg'
                  }`}
                style={{ width: '8.22cm', height: '5.44cm', maxWidth: '100%' }}
              >
                {/* Branch Logo / Image - Corner to corner eager cover */}
                {imageSrc && !hasImgError ? (
                  <img
                    src={imageSrc}
                    alt={companyName}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="w-full h-full object-cover object-center rounded-2xl group-hover:scale-105 transition-transform duration-500 ease-out"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    onError={() => setImgErrors(prev => ({ ...prev, [b.id || idx]: true }))}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black text-slate-500/40 tracking-widest uppercase">
                      {getInitials(rawName)}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase mt-1">
                      Branch Logo
                    </span>
                  </div>
                )}

                {/* Dark gradient overlay for typography readability and depth */}
                <div
                  className={`absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 ${isSelected
                    ? 'bg-gradient-to-t from-slate-950 via-slate-950/40 to-blue-950/20'
                    : 'bg-gradient-to-t from-slate-950 via-slate-950/40 to-black/20 group-hover:from-slate-950 group-hover:via-slate-950/30'
                    }`}
                />

                {/* Active badge if selected */}
                {isSelected && (
                  <div className="absolute top-3 right-3 bg-blue-600 text-white text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 z-10 backdrop-blur-md">
                    <FiCheck size={11} className="stroke-[3]" /> Active
                  </div>
                )}

                {/* Integrated Branch Name & City Pill Badges cleanly positioned at the bottom inside the card */}
                <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 flex items-center justify-between gap-2 z-10 pointer-events-none">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {/* Branch Name Badge */}
                    <span
                      title={companyName}
                      className={`inline-flex items-center text-xs sm:text-sm font-black tracking-wider uppercase px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all truncate ${isSelected
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/40'
                        : 'bg-slate-900/90 text-white border-slate-700/80 group-hover:border-blue-400/60'
                        }`}
                    >
                      {companyName}
                    </span>

                    {/* City Location Pill */}
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold tracking-widest uppercase px-2.5 py-1.5 rounded-xl border backdrop-blur-md transition-all shrink-0 ${isSelected
                        ? 'bg-blue-500/25 text-blue-300 border-blue-400/50'
                        : 'bg-slate-950/80 text-slate-300 border-slate-700/80 group-hover:text-white group-hover:border-slate-600'
                        }`}
                    >
                      <FiMapPin className="w-3 h-3 text-blue-400 shrink-0" />
                      <span>{cityName}</span>
                    </span>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Next Arrow - outer right edge, vertically centered */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canScrollRight}
        aria-label="Next Branch"
        className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl bg-card dark:bg-[#0F172A] border border-border dark:border-slate-800 hover:bg-muted dark:hover:bg-slate-800 text-foreground dark:text-white transition-all shadow-xs hover:shadow cursor-pointer active:scale-95 disabled:opacity-20 disabled:cursor-default disabled:hover:bg-card dark:disabled:hover:bg-[#0F172A] z-10"
      >
        <FiChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

    </div>
  );
}
