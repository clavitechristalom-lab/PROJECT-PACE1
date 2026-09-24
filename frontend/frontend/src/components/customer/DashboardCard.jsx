import React from 'react';

export default function DashboardCard({ title, value, icon, subtitle, colorClass = "bg-[#176B87]", trend, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-[var(--card)] text-[var(--foreground)] rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow relative overflow-hidden group ${onClick ? 'cursor-pointer hover:border-primary/50' : ''}`}
    >
      <div className={`absolute top-0 left-0 w-1.5 h-full ${colorClass}`}></div>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">{title}</p>
          <h3 className="text-2xl font-bold">{value}</h3>
          {(subtitle || trend) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
              {trend && (
                <span className={trend > 0 ? 'text-green-500' : 'text-red-500'}>
                  {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
                </span>
              )}
              {subtitle && <span>{subtitle}</span>}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorClass} text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
