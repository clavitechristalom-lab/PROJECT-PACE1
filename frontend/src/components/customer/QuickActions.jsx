import React from 'react';
import { ShoppingCart, FileText, CreditCard, HelpCircle, ChevronRight } from 'lucide-react';

export default function QuickActions({ onAction }) {
  const actions = [
    { name: 'Browse Products', icon: <ShoppingCart size={20} />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40', border: 'border-blue-200 dark:border-blue-800' },
    { name: 'View Statements', icon: <FileText size={20} />, color: 'text-[#176B87] dark:text-[#64ccc5]', bg: 'bg-[#176B87]/10 dark:bg-[#176B87]/20', border: 'border-[#176B87]/20 dark:border-[#176B87]/30' },
    { name: 'Make Payment', icon: <CreditCard size={20} />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40', border: 'border-emerald-200 dark:border-emerald-800' },
    { name: 'Support', icon: <HelpCircle size={20} />, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700' },
  ];

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 p-16 bg-gradient-to-bl from-slate-100 to-transparent dark:from-slate-800/50 rounded-bl-full opacity-50 pointer-events-none"></div>
      
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-5 relative z-10">Quick Actions</h2>
      <div className="flex flex-col gap-3 relative z-10">
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={() => onAction && onAction(action.name)}
            className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all group cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${action.bg} ${action.color} border ${action.border} flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                {action.icon}
              </div>
              <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">{action.name}</span>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
              <ChevronRight size={18} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
