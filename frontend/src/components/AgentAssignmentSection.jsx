import React from 'react'
import {
  FiUserCheck,
  FiUserX,
  FiTrendingUp,
  FiAlertCircle,
} from 'react-icons/fi'
import { fmt } from '../lib/utils'

const AgentAssignmentSection = ({
  hasAgent = false,
  onToggleAgent,
  summary = {
    appliances_sales_total: 0,
    furniture_sales_total: 0,
    appliances_agent_contribution: 0,
    furniture_agent_contribution: 0,
    total_agent_contribution: 0,
    has_unclassified_items: false,
  },
  categoryNotice = '',
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-primary text-[11px]">
          <FiUserCheck className="w-4 h-4" />
          <span>Agent Assignment / Sales Agent</span>
        </div>

        <div className="inline-flex rounded-xl bg-muted p-1 border border-border">
          <button
            type="button"
            onClick={() => onToggleAgent(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              !hasAgent
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FiUserX className="w-3.5 h-3.5" />
            <span>Without Agent</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleAgent(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              hasAgent
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FiUserCheck className="w-3.5 h-3.5" />
            <span>With Agent</span>
          </button>
        </div>
      </div>

      {hasAgent && (
        <div className="space-y-3 pt-1">
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                <FiTrendingUp className="w-3.5 h-3.5" />
                <span>Agent Contribution</span>
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground">
                Appliances 12% • Furniture 15% (Net after discount)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                  <span>Appliances (12%)</span>
                  <span className="font-mono text-foreground/70">
                    {fmt(summary.appliances_sales_total)}
                  </span>
                </div>
                <div className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400 mt-0.5">
                  {fmt(summary.appliances_agent_contribution)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                  <span>Furniture (15%)</span>
                  <span className="font-mono text-foreground/70">
                    {fmt(summary.furniture_sales_total)}
                  </span>
                </div>
                <div className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                  {fmt(summary.furniture_agent_contribution)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Total Agent Contribution
                </div>
                <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {fmt(summary.total_agent_contribution)}
                </div>
              </div>
            </div>

            {(categoryNotice || summary.has_unclassified_items) && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {categoryNotice || 'Select an Appliances or Furniture category to calculate item contribution.'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AgentAssignmentSection
