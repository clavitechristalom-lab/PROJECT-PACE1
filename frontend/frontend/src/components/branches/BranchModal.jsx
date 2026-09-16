import { useState } from "react";
import { FiX, FiPackage, FiUsers, FiShoppingCart, FiCreditCard, FiCalendar, FiDollarSign, FiInbox } from "react-icons/fi";

const TABS = [
  { id: "products", label: "Products", icon: FiPackage },
  { id: "customers", label: "Customers", icon: FiUsers },
  { id: "sales", label: "Sales", icon: FiShoppingCart },
  { id: "installments", label: "Installments", icon: FiCreditCard },
  { id: "paymentSchedule", label: "Payment Schedule", icon: FiCalendar },
  { id: "payments", label: "Payments", icon: FiDollarSign },
];

export default function BranchModal({ branch, onClose }) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  const currentData = branch[activeTab] || [];

  return (
    <div className="modal-backdrop">
      <div className="branch-modal-shell animate-fade-in">
        
        <div className="modal-header">
          <div 
            className="modal-branch-avatar"
            style={{ background: branch.color || '#2b5ce6' }}
          >
            {branch.initials}
          </div>
          <div className="flex-1">
            <h2 className="modal-title">{branch.fullName}</h2>
            <div className="modal-meta">
              Location: <strong>{branch.location}</strong> &bull; Manager: <strong>{branch.manager}</strong>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="stat-chip">
              <span className="stat-chip-label">Status</span>
              <span className="stat-chip-value">
                {branch.status === 'open' ? (
                  <span className="figma-badge figma-badge-green">Open</span>
                ) : (
                  <span className="figma-badge figma-badge-red">Closed</span>
                )}
              </span>
            </div>
            <div className="stat-divider"></div>
            <button className="modal-close" onClick={onClose}>
              <FiX size={20} />
            </button>
          </div>
        </div>

        <div className="tabs-bar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="tab-icon" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="tab-body bg-white">
          <div className="section-toolbar">
            <div className="section-count">
              Showing <strong>{currentData.length}</strong> items in this branch
            </div>
          </div>

          {currentData.length === 0 ? (
            <div className="empty-state-figma">
              <div className="empty-state-icon">
                <FiInbox size={22} />
              </div>
              <h3 className="empty-state-title">No {activeTab} found</h3>
              <p className="empty-state-sub">
                This branch doesn't have any records for {activeTab} yet.
              </p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Details</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.map((item, idx) => (
                      <tr key={idx}>
                        <td className="td-mono">{item.id || `#${idx+1}`}</td>
                        <td className="td-strong">{item.name || item.title || 'Unknown'}</td>
                        <td><span className="figma-badge figma-badge-gray">Active</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
