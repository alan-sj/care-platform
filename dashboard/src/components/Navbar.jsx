import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const location = useLocation()

  const links = [
    { path: '/', label: 'Dashboard' },
    { path: '/patients', label: 'Patients' },
    { path: '/alerts', label: 'Alerts' },
  ]

  return (
    <nav style={{
      backgroundColor: '#1e3a5f',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      height: '60px',
      gap: '32px'
    }}>
      <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>
        🏥 Care Platform
      </span>
      {links.map(link => (
        <Link
          key={link.path}
          to={link.path}
          style={{
            color: location.pathname === link.path ? '#60a5fa' : '#cbd5e1',
            textDecoration: 'none',
            fontWeight: location.pathname === link.path ? 'bold' : 'normal',
            fontSize: '15px'
          }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}