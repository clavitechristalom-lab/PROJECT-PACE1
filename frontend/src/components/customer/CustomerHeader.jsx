import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Search, Bell, Moon, Sun, Menu, User, LogOut } from 'lucide-react';

export default function CustomerHeader({ toggleTheme, isDark }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const formatTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-[#176B87] text-white shadow-md select-none transition-colors duration-300">
      <div className="flex items-center gap-4">
        {/* Logo Placeholder */}
        <div className="w-10 h-10 bg-white rounded-md flex items-center justify-center text-[#176B87] font-bold text-xl cursor-pointer" onClick={() => navigate('/customer/dashboard')}>
          C
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-wide">Customer Portal</h1>
          <p className="text-xs text-white/80">Monitor your accounts & payments</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex flex-col items-end mr-4">
          <span className="font-semibold">{formatTime(currentTime)}</span>
          <span className="text-xs text-white/80">{formatDate(currentTime)}</span>
        </div>

        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-white/20 transition-colors"
          title="Toggle Theme"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button className="p-2 rounded-full hover:bg-white/20 transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#176B87]"></span>
        </button>

        <div className="relative group cursor-pointer ml-2 flex items-center gap-3">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-semibold">{user?.name || 'Customer'}</span>
            <span className="text-xs text-white/80 capitalize">{user?.role}</span>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center border-2 border-white/50 overflow-hidden">
            {user?.profile_image ? (
              <img src={user.profile_image} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User size={20} className="text-white" />
            )}
          </div>
          
          {/* Dropdown menu */}
          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1a2332] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-slate-800 dark:text-slate-200 transform origin-top-right scale-95 group-hover:scale-100">
            <div className="px-4 py-2 border-b dark:border-slate-700 sm:hidden">
              <p className="font-semibold truncate">{user?.name}</p>
            </div>
            <button 
              onClick={() => {}} 
              className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <User size={16} /> Profile
            </button>
            <button 
              onClick={handleLogout} 
              className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
