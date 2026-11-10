import { useState, useEffect, useMemo } from 'react'
import {
  FiMessageSquare, FiX, FiCheckCircle, FiSend, FiUser, FiClock, FiTag, FiZap, FiTrash2,
  FiAlertCircle
} from 'react-icons/fi'
import {
  PageHeader, Card, StatusBadge, LoadingState, EmptyState, Pagination, SearchBar,
  showToast, showError, confirmDelete
} from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'

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

  const senderName = message.customer
    ? `${message.customer.first_name || ''} ${message.customer.last_name || ''}`.trim()
    : (message.name || 'Customer')

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FiMessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Respond to Customer Feedback</h2>
              <p className="text-xs text-muted-foreground">Send an official response to this customer's feedback or inquiry</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors cursor-pointer">
            <FiX className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
          {/* Main Message Card */}
          <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <FiUser className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <span>{senderName}</span>
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <FiTag className="w-3 h-3" />
                  <span className="font-semibold text-primary">{message.topic}</span>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1 font-mono">
                    <FiClock className="w-3 h-3" />
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <StatusBadge status={message.status} />
            </div>

            <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed bg-card p-3 rounded-xl border border-border/60">
              {message.message}
            </div>
          </div>

          {/* Chat History if any */}
          {message.chat_history && message.chat_history.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conversation History</h4>
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {message.chat_history.map((msg, idx) => {
                  const isStaff = msg.sender_role === 'staff' || msg.sender_role === 'admin'
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-xs ${
                        isStaff
                          ? 'bg-primary/10 border border-primary/20 ml-6 text-foreground'
                          : 'bg-muted/50 border border-border mr-6 text-foreground'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1 font-semibold text-[11px] text-muted-foreground">
                        <span>{isStaff ? 'Staff Support' : senderName}</span>
                        <span className="font-mono text-[10px]">{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}</span>
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.message}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Response Form */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FiZap className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-bold text-foreground">Quick Responses</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1 mb-4">
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

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-2">
                Your Response {response ? '' : '(select a quick response or type below)'}
              </label>
              <textarea
                value={response}
                onChange={e => setResponse(e.target.value)}
                rows={4}
                placeholder="Type your official customer response here..."
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm resize-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground rounded-xl border border-border hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !response.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs active:scale-95"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <FiSend className="w-4 h-4" />
            )}
            <span>{sending ? 'Sending...' : 'Send Response'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SupportPage() {
  const { user } = useAuth()
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
      // Filter out any employee letter messages so Customer Support is strictly dedicated to customers
      const allMsgs = data.messages || []
      const customerMsgs = allMsgs.filter(m => m.message_type !== 'employee_letter' && !m.employee_id)
      setMessages(customerMsgs)
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
  }, [], { module: 'support' })

  const filtered = useMemo(() => {
    return messages.filter(m => {
      // Status filter
      if (statusFilter !== 'All' && m.status !== statusFilter) return false

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const cust = m.customer ? `${m.customer.first_name || ''} ${m.customer.last_name || ''}`.toLowerCase() : ''
        const name = (m.name || '').toLowerCase()
        const topic = (m.topic || '').toLowerCase()
        const text = (m.message || '').toLowerCase()
        return cust.includes(q) || name.includes(q) || topic.includes(q) || text.includes(q)
      }
      return true
    })
  }, [messages, search, statusFilter])

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const total = filtered.length
  const pendingCount = messages.filter(m => m.status === 'Pending').length
  const resolvedCount = messages.filter(m => m.status === 'Approved' || m.status === 'Responded').length

  const handleSendResponse = async (id, responseText) => {
    try {
      await api.supportMessages.update(id, { new_message: responseText })
      loadMessages(true)
      triggerDataSync('support')
      triggerDataSync('notifications')
      showToast('Response sent successfully to customer!', 'success')
    } catch (err) {
      showError('Failed to Send', err.message || 'Could not send response')
    }
  }

  const handleDeleteMessage = async (id) => {
    const confirmed = await confirmDelete(
      'this support inquiry',
      'This will permanently delete this customer inquiry.'
    )
    if (confirmed) {
      try {
        await api.supportMessages.delete(id)
        loadMessages(true)
        triggerDataSync('support')
        triggerDataSync('notifications')
        showToast('Inquiry deleted successfully', 'success')
      } catch (err) {
        console.error(err)
        showError('Delete Failed', err.message || 'Failed to delete message.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Support"
        subtitle="Manage customer feedback, inquiries, and support messages in real-time"
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <FiMessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground">{messages.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Total Customer Inquiries</p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <FiClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{pendingCount}</p>
            <p className="text-xs text-muted-foreground font-medium">Pending Inquiries</p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <FiCheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground">{resolvedCount}</p>
            <p className="text-xs text-muted-foreground font-medium">Responded Inquiries</p>
          </div>
        </Card>
      </div>

      {/* Search and Status Dropdown Card */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="w-full sm:flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search customer name, topic, or message content..." />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer w-full sm:w-auto"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Responded">Responded</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Messages List */}
      <div className="grid gap-4">
        {loading ? (
          <LoadingState message="Loading customer support messages from live database..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiMessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No customer inquiries found"
            description="All customer support messages have been addressed or no inquiries match your filter."
          />
        ) : (
          <>
            {paginated.map(m => {
              const custName = m.customer
                ? `${m.customer.first_name || ''} ${m.customer.last_name || ''}`.trim()
                : (m.name || 'Customer Inquiry')

              return (
                <Card key={m.id} className="p-5 relative group border border-border hover:border-primary/30 transition-colors">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row gap-4 justify-between items-start">
                      <div className="flex-1 min-w-0">
                        {/* Header Badge & Name */}
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                            <FiUser className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-foreground text-base leading-tight">{custName}</h3>
                              <StatusBadge status={m.status} />
                            </div>
                            {m.email && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{m.email}</p>
                            )}
                          </div>
                        </div>

                        {/* Topic & Timestamp */}
                        <div className="pl-12 space-y-1 mb-2">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="font-bold text-primary">{m.topic}</span>
                            <span className="mx-1">&bull;</span>
                            <span className="flex items-center gap-1 font-mono">
                              <FiClock className="w-3 h-3" />
                              {new Date(m.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Message Preview */}
                        <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed max-w-4xl pl-12 bg-muted/20 p-3 rounded-xl border border-border/50">
                          {m.message}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="shrink-0 flex items-center gap-2 flex-wrap lg:flex-nowrap">
                        <button
                          onClick={() => setRespondModal({ open: true, message: m })}
                          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          <FiSend className="w-4 h-4" />
                          <span>{m.status === 'Pending' ? 'Respond' : 'View / Re-respond'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteMessage(m.id)}
                          className="flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          title="Delete Message"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
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
