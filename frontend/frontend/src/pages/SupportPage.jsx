import { useState, useEffect, useMemo } from 'react'
import {
  FiMessageSquare, FiX, FiCheckCircle, FiSend, FiUser, FiClock, FiTag, FiZap
} from 'react-icons/fi'
import {
  PageHeader, Card, StatusBadge, LoadingState, EmptyState, Pagination, SearchBar
} from '../components/ui'
import { api } from '../lib/api'
import { useRealtimeSync } from '../lib/realtimeSync'
import Swal from 'sweetalert2'

const QUICK_RESPONSES = [
  "Thank you for your feedback. We appreciate you taking the time to share your experience.",
  "We're sorry for the inconvenience. We will review your concern and take the necessary action.",
  "Thank you for reporting this issue. Our team will look into it as soon as possible.",
  "Your feedback has been received and forwarded to the appropriate team.",
  "We value your input and will use it to improve our services. Thank you for reaching out.",
  "We apologize for the issue you've experienced. Our team is already working on resolving it.",
  "Thank you for contacting us. We will get back to you with a resolution shortly.",
  "Your concern is important to us. We have escalated it to the relevant department for immediate action.",
]

function RespondModal({ isOpen, onClose, message, onSend }) {
  const [response, setResponse] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (isOpen) setResponse('')
  }, [isOpen])

  const handleSend = async () => {
    if (!response.trim()) return
    setSending(true)
    try {
      await onSend(message.id, response)
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (!isOpen || !message) return null

  const customerName = message.customer
    ? `${message.customer.first_name} ${message.customer.last_name}`
    : 'Unknown Customer'

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FiMessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Respond to Feedback</h2>
              <p className="text-xs text-muted-foreground">Send a response to this customer's feedback</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <FiX className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Customer Feedback Card */}
          <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <FiUser className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-sm">{customerName}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FiTag className="w-3 h-3" />
                  <span>{message.topic}</span>
                  <span className="mx-1">•</span>
                  <FiClock className="w-3 h-3" />
                  <span>{new Date(message.created_at).toLocaleString()}</span>
                </div>
              </div>
              <StatusBadge status={message.status} />
            </div>
            <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed pl-12">
              {message.message}
            </div>
            
            {message.response && (
              <div className="ml-12 border-l-2 border-emerald-500 pl-4 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-r-xl">
                <div className="flex items-center gap-2 mb-1">
                  <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Admin Response</span>
                  {message.responded_at && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(message.responded_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{message.response}</p>
              </div>
            )}

            {message.customer_reply && (
              <div className="ml-12 mt-2 border-l-2 border-primary/50 pl-4 py-2 bg-primary/5 rounded-r-xl">
                <div className="flex items-center gap-2 mb-1">
                  <FiMessageSquare className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold text-primary">Customer's Reply</span>
                  {message.customer_reply_at && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(message.customer_reply_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{message.customer_reply}</p>
              </div>
            )}
          </div>

          {/* Quick Responses */}
          {!message.customer_reply && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FiZap className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-bold text-foreground">Quick Responses</h4>
                  <span className="text-xs text-muted-foreground">(click to select)</span>
                </div>
                <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                  {QUICK_RESPONSES.map((qr, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setResponse(qr)}
                      className={`text-left px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed transition-all cursor-pointer ${
                        response === qr
                          ? 'border-primary bg-primary/10 text-primary font-medium shadow-sm'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50 text-foreground/80'
                      }`}
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Response Textarea */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-2">
                  Your Response {response ? '' : '(select a quick response or type below)'}
                </label>
                <textarea
                  value={response}
                  onChange={e => setResponse(e.target.value)}
                  rows={4}
                  placeholder="Type your custom response here or select a quick response above..."
                  className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm resize-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            </>
          )}
          {message.customer_reply && (
            <div className="p-4 bg-muted/50 border border-border rounded-xl text-center">
              <p className="text-sm text-muted-foreground">The customer has replied. This conversation is now in view-only mode.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          {!message.customer_reply && (
            <button
              onClick={handleSend}
              disabled={sending || !response.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <FiSend className="w-4 h-4" />
              )}
              <span>{sending ? 'Sending...' : 'Send Response'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SupportPage() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [respondModal, setRespondModal] = useState({ open: false, message: null })
  const pageSize = 12

  const loadMessages = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const data = await api.supportMessages.getAll()
      setMessages(data.messages || [])
    } catch (err) {
      console.error(err)
      if (!silent) setError('Failed to load support messages')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages()
  }, [])

  useRealtimeSync(() => {
    loadMessages(true)
  }, [])

  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (statusFilter !== 'All' && m.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const cust = m.customer ? `${m.customer.first_name} ${m.customer.last_name}`.toLowerCase() : ''
        return cust.includes(q) || m.topic.toLowerCase().includes(q) || m.message.toLowerCase().includes(q)
      }
      return true
    })
  }, [messages, search, statusFilter])

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const total = filtered.length
  const pendingCount = messages.filter(m => m.status === 'Pending').length
  const respondedCount = messages.filter(m => m.status === 'Responded').length

  const handleSendResponse = async (id, responseText) => {
    await api.supportMessages.update(id, { status: 'Responded', response: responseText })
    loadMessages(true)
    Swal.fire({
      icon: 'success',
      title: 'Response Sent',
      text: 'The customer has been notified of your response.',
      toast: true,
      position: 'bottom-end',
      showConfirmButton: false,
      timer: 3000,
      background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Support"
        subtitle="Manage and respond to customer feedback and inquiries in real-time"
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <FiMessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground">{messages.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Total Messages</p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <FiClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground">{pendingCount}</p>
            <p className="text-xs text-muted-foreground font-medium">Pending</p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <FiCheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground">{respondedCount}</p>
            <p className="text-xs text-muted-foreground font-medium">Responded</p>
          </div>
        </Card>
      </div>

      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="w-full sm:flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search by customer name, topic, or message..." />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Responded">Responded</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiMessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No messages found"
            description="You're all caught up with customer inquiries."
          />
        ) : (
          <>
            {paginated.map(m => {
              const customerName = m.customer ? `${m.customer.first_name} ${m.customer.last_name}` : 'Unknown Customer'
              return (
                <Card key={m.id} className="p-5 relative group border border-border hover:border-primary/30 transition-colors">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <FiUser className="w-4 h-4 text-primary" />
                          </div>
                          <h3 className="font-bold text-foreground text-base">{customerName}</h3>
                          <StatusBadge status={m.status} />
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2 pl-11">
                          Topic: {m.topic}
                        </div>
                        <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed max-w-4xl pl-11">
                          {m.message}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setRespondModal({ open: true, message: m })}
                        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        <FiSend className="w-4 h-4" />
                        {m.customer_reply ? 'View Conversation' : m.status === 'Pending' ? 'Respond' : 'View / Re-respond'}
                      </button>
                    </div>

                    {/* Show existing response if any */}
                    {m.response && (
                      <div className="ml-11 border-l-2 border-emerald-500 pl-4 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-r-xl mt-4">
                        <div className="flex items-center gap-2 mb-1">
                          <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Admin Response</span>
                          {m.responded_at && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {new Date(m.responded_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed">{m.response}</p>
                      </div>
                    )}
                    
                    {/* Show existing customer reply if any */}
                    {m.customer_reply && (
                      <div className="ml-11 border-l-2 border-primary/50 pl-4 py-2 bg-primary/5 rounded-r-xl mt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <FiMessageSquare className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold text-primary">Customer's Reply</span>
                          {m.customer_reply_at && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {new Date(m.customer_reply_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed">{m.customer_reply}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      <RespondModal
        isOpen={respondModal.open}
        onClose={() => setRespondModal({ open: false, message: null })}
        message={respondModal.message}
        onSend={handleSendResponse}
      />
    </div>
  )
}
