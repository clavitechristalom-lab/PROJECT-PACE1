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

  const cdoRegex = /(.*?)(?:[-–—\s]+)(C\.?D\.?O\.?|CDO|CAGAYAN DE ORO)(?:\s+CITY)?$/i;
  const iliganRegex = /(.*?)(?:[-–—\s]+)(ILIGAN)(?:\s+CITY)?$/i;
  const depologRegex = /(.*?)(?:[-–—\s]+)(DEPOLOG|DIPOLOG)(?:\s+CITY)?$/i;

  const mCdo = rawName.match(cdoRegex);
  const mIligan = rawName.match(iliganRegex);
  const mDepolog = rawName.match(depologRegex);

  if (mCdo) {
    companyName = mCdo[1].trim();
    cityName = 'C.D.O';
  } else if (mIligan) {
    companyName = mIligan[1].trim();
    cityName = 'ILIGAN';
  } else if (mDepolog) {
    companyName = mDepolog[1].trim();
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
        <div className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-card border border-border/60 opacity-30" />
        <div className="flex-1 min-w-0 flex gap-3 sm:gap-4 md:gap-5 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="w-full h-30 sm:h-34 md:h-34 rounded-2xl bg-card border border-border/60 animate-pulse" />
              <div className="w-28 h-5 rounded-full bg-muted/60 mx-auto animate-pulse" />
              <div className="w-16 h-4 rounded-full bg-muted/40 mx-auto animate-pulse" />
            </div>
          ))}
        </div>
        <div className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-card border border-border/60 opacity-30" />
      </div>
    );
  }

  const isFew = branches.length <= 3;

  return (
    <div className="w-full relative flex items-center gap-2 sm:gap-3.5 select-none py-1">

      {/* Prev Arrow - outer left edge */}
      <button
        type="button"
        onClick={handlePrev}
        disabled={!canScrollLeft}
        aria-label="Previous Branch"
        className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl bg-card border border-border hover:bg-muted text-primary hover:text-primary transition-all shadow-xs hover:shadow cursor-pointer active:scale-95 disabled:opacity-20 disabled:cursor-default disabled:hover:bg-card z-10"
      >
        <FiChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Slider Container - Edge to Edge between arrows */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex-1 min-w-0 flex gap-3 sm:gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory no-scrollbar py-2 scroll-smooth"
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
              className={`cursor-pointer group relative shrink-0 snap-start transition-all ${
                isFew
                  ? 'w-full min-w-full sm:w-[calc(50%-0.625rem)] sm:min-w-0 lg:w-auto lg:flex-1 lg:min-w-0 lg:max-w-none lg:shrink'
                  : 'w-full min-w-full sm:w-[calc(50%-0.625rem)] sm:min-w-0 lg:w-[calc((100%-2*1.25rem)/3)]'
              }`}
            >
              {/* Card Container - Medium Size with corner-to-corner image fit */}
              <div
                className={`w-full h-30 sm:h-34 md:h-34 rounded-2xl flex items-center justify-center relative overflow-hidden bg-slate-900 shadow-xs transition-[border-color,box-shadow] duration-200
                  ${isSelected
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background shadow-md shadow-blue-500/25'
                    : 'border border-border/80 group-hover:border-blue-500/60 group-hover:shadow-md'
                  }`}
              >
                {/* Branch Logo / Image - Corner to corner eager cover */}
                {imageSrc && !hasImgError ? (
                  <img
                    src={imageSrc}
                    alt={companyName}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="w-full h-full object-cover object-center rounded-2xl group-hover:scale-105 transition-transform duration-300 ease-out"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    onError={() => setImgErrors(prev => ({ ...prev, [b.id || idx]: true }))}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-slate-400/70 tracking-widest uppercase">
                      {getInitials(rawName)}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase mt-1">
                      Branch Logo
                    </span>
                  </div>
                )}

                {/* Subtle overlay for depth & readability */}
                <div
                  className={`absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-200 ${isSelected
                    ? 'bg-blue-600/15'
                    : 'bg-black/10 group-hover:bg-black/0'
                    }`}
                />

                {/* Active badge if selected */}
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 bg-blue-600 text-white text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 z-10 backdrop-blur-xs">
                    <FiCheck size={11} className="stroke-[3]" /> Active
                  </div>
                )}
              </div>

              {/* Centered Branch Name & City Pill Badges below the card */}
              <div className="mt-2.5 flex flex-col items-center justify-center gap-1.5 w-full px-1">
                {/* Branch Name Pill */}
                <div className="max-w-full flex items-center justify-center">
                  <span
                    title={companyName}
                    className={`inline-flex items-center justify-center text-center text-[11px] sm:text-xs font-black tracking-wider uppercase px-4 py-1.5 rounded-full border shadow-xs max-w-full truncate transition-colors duration-200 ${isSelected
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                      : 'bg-card text-foreground border-border group-hover:border-blue-400/70 group-hover:bg-muted group-hover:text-foreground'
                      }`}
                  >
                    {companyName}
                  </span>
                </div>

                {/* City Pill Badge */}
                <div className="flex items-center justify-center">
                  <span
                    className={`inline-flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] font-black tracking-widest uppercase px-3 py-0.5 rounded-full border transition-colors duration-200 ${isSelected
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-400/40'
                      : 'bg-muted/80 text-muted-foreground border-border/80 group-hover:text-foreground group-hover:bg-muted'
                      }`}
                  >
                    <FiMapPin className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                    <span>{cityName}</span>
                  </span>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Next Arrow - outer right edge */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canScrollRight}
        aria-label="Next Branch"
        className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl bg-card border border-border hover:bg-muted text-primary hover:text-primary transition-all shadow-xs hover:shadow cursor-pointer active:scale-95 disabled:opacity-20 disabled:cursor-default disabled:hover:bg-card z-10"
      >
        <FiChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

    </div>
  );
}
