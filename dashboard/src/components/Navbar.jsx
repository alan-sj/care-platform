import { Link, useLocation } from 'react-router-dom'
import * as Icons from './Icons'

export default function Navbar() {
  const location = useLocation()

  const generalLinks = [
    { path: '/',          label: 'Dashboard', icon: <Icons.LayoutDashboard size={18} /> },
    { path: '/schedule',  label: 'Schedule',  icon: <Icons.Calendar size={18} /> },
    { path: '/patients',  label: 'Patients',  icon: <Icons.Users size={18} /> },
    { path: '/wellness',  label: 'Wellness',  icon: <Icons.Heart size={18} /> },
    { path: '/notes',     label: 'Notes',     icon: <Icons.FileText size={18} /> },
    { path: '/alerts',    label: 'Alerts',    icon: <Icons.Bell size={18} /> },
  ]


  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path)

  return (
    <nav className="sidebar">
      <div className="sidebar-logo" style={{ color: 'var(--neutral-dark)' }}>
        <Icons.FirstAidCross size={20} style={{ strokeWidth: 2.5 }} /> Care Platform
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">General</div>
        <div className="sidebar-links">
          {generalLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={`sidebar-link ${isActive(link.path) ? 'sidebar-link-active' : ''}`}
            >
              <span style={{ display: 'flex', alignItems: 'center' }}>{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}