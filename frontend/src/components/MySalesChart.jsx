import { useState, useEffect } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { Card } from './ui'
import { api } from '../lib/api'

export default function MySalesChart({ sales }) {
  if (!sales || sales.length === 0) {
    return null
  }

  const grouped = {}
  sales.forEach(s => {
    const d = new Date(s.transaction_date || s.created_at)
    const month = d.toLocaleString('default', { month: 'short' })
    if (!grouped[month]) {
      grouped[month] = { month, total_sales: 0, units: 0 }
    }
    grouped[month].total_sales += Number(s.total_amount) || 0
    grouped[month].units += (s.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0)
  })

  const data = Object.values(grouped).sort((a, b) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return months.indexOf(a.month) - months.indexOf(b.month)
  })


  return (
    <Card noPad className="p-6 border border-border mb-6 bg-white dark:bg-card">
      <h3 className="text-xl font-bold text-foreground text-center mb-6">My sales</h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
            <YAxis 
              yAxisId="left" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
            />
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
              tickFormatter={v => `$${v.toLocaleString()}`}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === 'Total Transaction') return `$${value.toLocaleString()}`
                return value
              }}
              contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontSize: '12px' }}
              cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36} 
              iconType="plainline" 
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
              payload={[
                { value: 'Units Sold', type: 'rect', color: '#4472c4' },
                { value: 'Total Transaction', type: 'line', color: '#ed7d31' }
              ]}
            />
            <Bar yAxisId="left" dataKey="units_sold" name="Units Sold" fill="#4472c4" barSize={32} />
            <Line yAxisId="right" dataKey="sales" name="Total Transaction" type="monotone" stroke="#ed7d31" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
