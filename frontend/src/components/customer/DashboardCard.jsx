import React from 'react';

export default function DashboardCard({ title, value, icon, subtitle, colorClass = "bg-blue-600", trend, onClick }) {
  // Extract a text color representation if it's a tailwind bg class to make a soft background
  const isCustomColor = colorClass.includes('#');
  
  return (
    <div 
      onClick={onClick}
      className={`bg-[var(--card)] text-[var(--foreground)] rounded-2xl p-6 shadow-sm border border-blue-200/50 dark:border-blue-900/30 dark:bg-[#0c1838]/80 hover:shadow-lg transition-all duration-300 relative overflow-hidden group ${onClick ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500/50' : ''}`}
    >
      <div className="flex justify-between items-start relative z-10">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wider mb-2">{title}</p>
          <h3 className="text-3xl font-black tracking-tight">{value}</h3>
          {(subtitle || trend) && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 font-medium">
              {trend && (
                <span className={`px-1.5 py-0.5 rounded-md ${trend > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                  {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
                </span>
              )}
              {subtitle && <span>{subtitle}</span>}
            </p>
          )}
        </div>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm ${isCustomColor ? 'bg-blue-500/10 text-blue-500' : `${colorClass.replace('bg-', 'bg-').replace('500', '100').replace('600', '100')} ${colorClass.replace('bg-', 'text-')}`}`}>
          <div className="scale-125">
            {icon}
          </div>
        </div>
      </div>
      
      {/* Decorative background blob */}
      <div className={`absolute -bottom-6 -right-6 w-32 h-32 rounded-full opacity-10 transition-transform duration-700 group-hover:scale-150 ${colorClass}`}></div>
    </div>
  );
}
