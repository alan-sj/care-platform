import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const location = useLocation()

  const links = [
    { path: '/',          label: 'Dashboard' },
    { path: '/schedule',  label: 'Schedule'  },
    { path: '/patients',  label: 'Patients'  },
    { path: '/wellness',  label: 'Wellness'  },
    { path: '/notes',     label: 'Notes'     },
    { path: '/alerts',    label: 'Alerts'    },
  ]

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path)

  return (
    <nav style={{
      backgroundColor: '#1e3a5f',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      height: '60px',
      gap: '8px',
      overflowX: 'auto'
    }}>
      <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px', marginRight: '16px', whiteSpace: 'nowrap' }}>
        🏥 Care Platform
      </span>
      {links.map(link => (
        <Link
          key={link.path}
          to={link.path}
          style={{
            color: isActive(link.path) ? 'white' : '#94a3b8',
            textDecoration: 'none',
            fontWeight: isActive(link.path) ? '600' : '400',
            fontSize: '14px',
            padding: '6px 12px',
            borderRadius: '6px',
            backgroundColor: isActive(link.path) ? 'rgba(255,255,255,0.12)' : 'transparent',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.15s'
          }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}