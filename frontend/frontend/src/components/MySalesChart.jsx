import { useState, useEffect } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { Card } from './ui'
import { api } from '../lib/api'

export default function MySalesChart() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await api.dashboard.getCharts()
        if (res?.sales_trend) {
          setData(res.sales_trend)
        }
      } catch (e) {
        console.error('Failed to load chart data', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <Card noPad className="p-4 border border-border flex items-center justify-center h-[300px] mb-6">
        <div className="text-xs text-muted-foreground animate-pulse">Loading chart data...</div>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return null
  }

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
