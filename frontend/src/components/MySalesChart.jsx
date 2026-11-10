import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { Card } from './ui'
import { api } from '../lib/api'
import { useRealtimeSync, fastDeepEqual } from '../lib/realtimeSync'

export default function MySalesChart({ sales: propSales, title = 'My sales' }) {
  const [fetchedSales, setFetchedSales] = useState([])
  const inFlightRef = useRef(false)

  const loadSales = useCallback(async (_silent = false, signal) => {
    if (propSales !== undefined) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await api.sales.getAll({}, { signal })
      if (signal?.aborted) return
      const list = Array.isArray(res) ? res : (res?.data || [])
      setFetchedSales(prev => (fastDeepEqual(prev, list) ? prev : list))
    } catch (err) {
      if (err?.name !== 'AbortError') {
        // Silent background error ignore
      }
    } finally {
      inFlightRef.current = false
    }
  }, [propSales])

  useEffect(() => {
    if (propSales === undefined) {
      loadSales(false)
    }
  }, [propSales, loadSales])

  useRealtimeSync((_source, signal) => {
    if (propSales === undefined) {
      loadSales(true, signal)
    }
  }, [propSales, loadSales], { module: 'sales', enabled: propSales === undefined })

  const sales = propSales !== undefined ? propSales : fetchedSales

  if (!sales || sales.length === 0) {
    return null
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const grouped = Object.fromEntries(
    months.map(m => [m, { month: m, total_sales: 0, sales: 0, units: 0, units_sold: 0 }])
  )

  sales.forEach(s => {
    const rawDate = s.sale_date || s.transaction_date || s.created_at
    if (!rawDate) return
    const d = new Date(rawDate)
    if (Number.isNaN(d.getTime())) return
    const month = months[d.getMonth()]
    if (!grouped[month]) return
    const amt = Number(s.total_amount ?? s.amount) || 0
    const qty = (s.items && s.items.length > 0)
      ? s.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
      : Number(s.items_count || 1)
    grouped[month].total_sales += amt
    grouped[month].sales += amt
    grouped[month].units += qty
    grouped[month].units_sold += qty
  })

  const data = months.map(m => grouped[m])

  return (
    <Card noPad className="p-6 border border-border mb-6 bg-card">
      <h3 className="text-xl font-bold text-foreground text-center mb-6">{title}</h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              dy={10}
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              domain={[0, dataMax => Math.max(Number(dataMax) || 0, 4)]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, dataMax => Math.max(Number(dataMax) || 0, 1000)]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickFormatter={v => `₱${Number(v || 0).toLocaleString()}`}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === 'Total Transaction') return [`₱${Number(value || 0).toLocaleString()}`, name]
                return [Number(value || 0).toLocaleString(), name]
              }}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
              }}
              labelStyle={{ color: 'var(--foreground)', fontWeight: 700, marginBottom: '4px' }}
              itemStyle={{ fontWeight: 600 }}
              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: 'var(--foreground)' }}
              payload={[
                { value: 'Total Transaction', type: 'line', color: '#ed7d31' },
                { value: 'Units Sold', type: 'rect', color: '#4472c4' },
              ]}
            />
            <Bar
              yAxisId="left"
              dataKey="units_sold"
              name="Units Sold"
              fill="#4472c4"
              barSize={28}
              radius={[6, 6, 0, 0]}
            />
            <Line
              yAxisId="right"
              dataKey="sales"
              name="Total Transaction"
              type="monotone"
              stroke="#ed7d31"
              strokeWidth={3}
              dot={{ r: 4, fill: '#ed7d31', strokeWidth: 2, stroke: 'var(--card)' }}
              activeDot={{ r: 6, fill: '#ed7d31', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
