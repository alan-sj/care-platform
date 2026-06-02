import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Alerts from './pages/Alerts'
import Schedule from './pages/Schedule'
import Wellness from './pages/Wellness'
import Notes from './pages/Notes'

import * as Icons from './components/Icons'

export default function App() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <BrowserRouter>
      <div className="main-layout">
        <Navbar />
        <div className="main-content">
          <header className="top-header" style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '16px 24px',
            borderBottom: '1px solid var(--neutral-border)',
            backgroundColor: 'var(--card-bg)',
            minHeight: '60px',
            boxSizing: 'border-box'
          }}>
            <div className="header-greeting" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--neutral-dark)', letterSpacing: '-0.2px' }}>
                {(() => {
                  const hr = new Date().getHours();
                  if (hr < 12) return '🌞 Good Morning';
                  if (hr < 17) return '🌤️ Good Afternoon';
                  return '🌙 Good Evening';
                })()}, Caregiver
              </span>
              <span style={{ fontSize: '11px', color: 'var(--neutral-muted)', fontWeight: '600' }}>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="header-tools">
              <button 
                className="header-icon-btn" 
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              >
                {theme === 'dark' ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
              </button>
            </div>
          </header>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/wellness" element={<Wellness />} />
            <Route path="/notes" element={<Notes />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}