import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FiMessageSquare, FiSend, FiClock, FiCheckCircle, FiPhoneCall,
  FiMapPin, FiMail, FiHelpCircle, FiInbox, FiTrash2, FiAlertCircle
} from 'react-icons/fi';
import { api } from '../../../lib/api';
import { Spinner, showSuccess, showError, confirmDelete } from '../../ui';
import { useRealtimeSync, triggerDataSync, fastDeepEqual } from '../../../lib/realtimeSync';

export default function CustomerSupportView({ user = null }) {
  const [activeTab, setActiveTab] = useState('submit'); // 'submit' | 'history'
  const [topic, setTopic] = useState('Installment Payment Query');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const inFlightRef = useRef(false);

  const loadMessages = useCallback(async (silent = false, signal) => {
    if (inFlightRef.current && silent) return;
    inFlightRef.current = true;
    if (!silent) setLoadingHistory(true);

    try {
      const data = await api.supportMessages.getAll({}, { signal });
      if (signal?.aborted) return;
      const nextMsgs = data.messages || data || [];
      setMessages(prev => fastDeepEqual(prev, nextMsgs) ? prev : nextMsgs);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Failed to load support messages', err);
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadMessages(false);
  }, [loadMessages]);

  useRealtimeSync((_source, signal) => {
    loadMessages(true, signal);
  }, [loadMessages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      await api.supportMessages.create({
        topic: topic.trim(),
        message: message.trim(),
        customer_name: user?.name || user?.full_name || 'Customer'
      });
      showSuccess('Message Sent', 'Our Z-Lics customer care team will respond promptly.');
      setMessage('');
      setActiveTab('history');
      loadMessages(true);
      triggerDataSync('support');
    } catch (err) {
      console.error(err);
      showError('Submission Failed', err.message || 'Could not send message.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirmDelete(
      'Delete Support Ticket',
      'Are you sure you want to remove this message thread?'
    );
    if (isConfirmed) {
      try {
        await api.supportMessages.delete(id);
        loadMessages(true);
        triggerDataSync('support');
      } catch (err) {
        showError('Delete Failed', err.message || 'Failed to delete message.');
      }
    }
  };

  const pendingCount = messages.filter(m => m.status === 'Pending' || !m.status).length;
  const resolvedCount = messages.filter(m => m.status === 'Resolved' || m.status === 'Closed').length;

  return (
    <div className="space-y-6 animate-[fadeIn_0.25s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 bg-[#D1E8E2]/70 dark:bg-teal-950/60 px-3 py-1 rounded-full border border-teal-500/20">
              Customer Care
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              Z-Lics Furniture & Appliances Support Desk
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Customer Support & Help Center
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Get help with your installments, report payment concerns, or ask questions directly to our store staff.
          </p>
        </div>
      </div>

      {/* Bento Contact Information Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Branch Hotline */}
        <div className="bg-[#D1E8E2]/50 dark:bg-[#162a26] border border-[#B0DDD3]/60 dark:border-teal-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-teal-800 dark:text-teal-300 font-bold shadow-xs">
              <FiPhoneCall className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-800/10 text-teal-900 dark:text-teal-200">
              Hotline
            </span>
          </div>
          <p className="text-xs font-semibold text-teal-950/70 dark:text-teal-300/70">Store Assistance</p>
          <p className="text-base sm:text-lg font-black text-teal-950 dark:text-teal-100 mt-0.5 truncate">
            0917-889-4512
          </p>
          <p className="text-[11px] text-teal-900/60 dark:text-teal-400/60 mt-1">
            Direct mobile & SMS support
          </p>
        </div>

        {/* Card 2: Branch Location */}
        <div className="bg-[#E2D6F5]/50 dark:bg-[#221c2e] border border-[#CAB8E8]/60 dark:border-purple-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-purple-800 dark:text-purple-300 font-bold shadow-xs">
              <FiMapPin className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-800/10 text-purple-900 dark:text-purple-200">
              Store Branch
            </span>
          </div>
          <p className="text-xs font-semibold text-purple-950/70 dark:text-purple-300/70">Iligan City Main</p>
          <p className="text-base sm:text-lg font-black text-purple-950 dark:text-purple-100 mt-0.5 truncate">
            Quezon Ave, Iligan
          </p>
          <p className="text-[11px] text-purple-900/60 dark:text-purple-400/60 mt-1 truncate">
            Near City Hall, Poblacion
          </p>
        </div>

        {/* Card 3: Support Hours */}
        <div className="bg-[#FBE8B5]/50 dark:bg-[#2b2718] border border-[#ECD18C]/60 dark:border-amber-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-amber-800 dark:text-amber-300 font-bold shadow-xs">
              <FiClock className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800/10 text-amber-900 dark:text-amber-200">
              Hours
            </span>
          </div>
          <p className="text-xs font-semibold text-amber-950/70 dark:text-amber-300/70">Operating Schedule</p>
          <p className="text-base sm:text-lg font-black text-amber-950 dark:text-amber-100 mt-0.5 truncate">
            8:00 AM – 5:00 PM
          </p>
          <p className="text-[11px] text-amber-900/60 dark:text-amber-400/60 mt-1">
            Monday through Saturday
          </p>
        </div>

        {/* Card 4: Ticket Stats */}
        <div className="bg-[#F8D7E3]/50 dark:bg-[#2c1c24] border border-[#F1B9CD]/60 dark:border-pink-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-rose-800 dark:text-rose-300 font-bold shadow-xs">
              <FiInbox className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-800/10 text-rose-900 dark:text-rose-200">
              Tickets
            </span>
          </div>
          <p className="text-xs font-semibold text-rose-950/70 dark:text-rose-300/70">Ticket Status</p>
          <p className="text-base sm:text-lg font-black text-rose-950 dark:text-rose-100 mt-0.5">
            {pendingCount} Pending / {resolvedCount} Done
          </p>
          <p className="text-[11px] text-rose-900/60 dark:text-rose-400/60 mt-1">
            {messages.length} total customer conversations
          </p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/70 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('submit')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'submit'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FiSend className="w-3.5 h-3.5 text-teal-600" />
          <span>New Inquiry / Message</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('history'); loadMessages(false); }}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FiClock className="w-3.5 h-3.5 text-purple-600" />
          <span>My Support History</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-purple-600 text-white">
            {messages.length}
          </span>
        </button>
      </div>

      {/* Content Area */}
      {activeTab === 'submit' ? (
        <div className="bg-card border border-border/80 rounded-[2.5rem] p-6 sm:p-8 shadow-xs max-w-3xl space-y-5">
          <div>
            <h3 className="text-lg font-extrabold text-foreground">Send a Message to Z-Lics Support</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fill out the details below and our customer service representative will attend to your request.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Inquiry Topic
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-muted/30 border border-border text-xs sm:text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all cursor-pointer"
              >
                <option value="Installment Payment Query">Installment Payment Query</option>
                <option value="Proof of Payment Verification">Proof of Payment Verification</option>
                <option value="Account Balance / Statement Clarification">Account Balance / Statement Clarification</option>
                <option value="Product Warranty & Service">Product Warranty & Service</option>
                <option value="General Store Inquiry">General Store Inquiry</option>
                <option value="Other Concerns">Other Concerns</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Detailed Message
              </label>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Explain your concern or inquiry with specific details (e.g. Account number, reference code, transaction date)..."
                className="w-full p-4 rounded-2xl bg-muted/30 border border-border text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
              >
                {submitting ? (
                  <>
                    <Spinner className="w-4 h-4 text-white" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <FiSend className="w-4 h-4" />
                    <span>Submit Inquiry</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          {loadingHistory ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Spinner className="w-8 h-8 text-purple-600" />
              <p className="text-xs text-muted-foreground font-semibold">Loading conversation history...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center rounded-[2.5rem] border border-dashed border-border p-8 bg-card space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <FiInbox className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-foreground">No Support History</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You haven't submitted any inquiries yet. If you have questions about your installments, feel free to submit a ticket.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isResolved = msg.status === 'Resolved' || msg.status === 'Closed';
              return (
                <div
                  key={msg.id || idx}
                  className="bg-card border border-border/80 rounded-[2rem] p-5 shadow-xs space-y-3 hover:border-purple-400/40 transition-all"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold">
                        <FiMessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-foreground">{msg.topic || 'Support Inquiry'}</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Submitted on {msg.created_at ? new Date(msg.created_at).toLocaleString() : 'Recent'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isResolved
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                      }`}>
                        {msg.status || 'Pending Review'}
                      </span>

                      {msg.id && (
                        <button
                          type="button"
                          onClick={() => handleDelete(msg.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                          title="Delete message"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                    {msg.message}
                  </div>

                  {msg.response && (
                    <div className="pl-4 border-l-2 border-teal-500 py-1 space-y-1 bg-teal-50/40 dark:bg-teal-950/20 p-3 rounded-r-xl">
                      <p className="text-[11px] font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1">
                        <FiCheckCircle className="w-3.5 h-3.5" />
                        Staff Response:
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">
                        {msg.response}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

