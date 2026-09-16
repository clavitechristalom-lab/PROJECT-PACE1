import React from 'react';
import { ShoppingCart, FileText, CreditCard, HelpCircle } from 'lucide-react';

export default function QuickActions({ onAction }) {
  const actions = [
    { name: 'Browse Products', icon: <ShoppingCart size={24} />, color: 'bg-blue-500' },
    { name: 'View Statements', icon: <FileText size={24} />, color: 'bg-[#176B87]' },
    { name: 'Make Payment', icon: <CreditCard size={24} />, color: 'bg-emerald-500' },
    { name: 'Support', icon: <HelpCircle size={24} />, color: 'bg-slate-500' },
  ];

  return (
    <div className="bg-[var(--card)] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={() => onAction && onAction(action.name)}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group cursor-pointer"
          >
            <div className={`w-12 h-12 rounded-full ${action.color} text-white flex items-center justify-center mb-3 shadow-md group-hover:scale-110 transition-transform`}>
              {action.icon}
            </div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{action.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
