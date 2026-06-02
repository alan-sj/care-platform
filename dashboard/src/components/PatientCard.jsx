import { useNavigate } from 'react-router-dom'
import * as Icons from './Icons'

export default function PatientCard({ patient }) {
  const navigate = useNavigate()
  const linked = !!patient.telegram_chat_id

  // Get patient initials for the avatar badge
  const getInitials = (name) => {
    if (!name) return 'PT'
    const parts = name.split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  return (
    <div
      onClick={() => navigate(`/patients/${patient.id}`)}
      className="card-premium card-premium-clickable"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--neutral-border)',
        backgroundColor: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'pointer',
        height: '220px',
        boxSizing: 'border-box'
      }}
    >
      {/* Top Section: Avatar & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary-color) 0%, #a855f7 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          fontSize: '15px',
          boxShadow: '0 4px 10px rgba(139, 92, 246, 0.15)',
          letterSpacing: '0.5px'
        }}>
          {getInitials(patient.name)}
        </div>
        <span className={`badge-premium ${linked ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px', padding: '4px 10px' }}>
          {linked ? 'Telegram Linked' : 'Pending Link'}
        </span>
      </div>

      {/* Name and Conditions */}
      <div style={{ flexGrow: 1, marginBottom: '12px' }}>
        <h3 style={{
          margin: '0 0 6px 0',
          fontSize: '17px',
          fontWeight: '700',
          color: 'var(--neutral-dark)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {patient.name}
        </h3>
        
        {/* Truncated conditions or placeholder */}
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--neutral-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          <Icons.Activity size={12} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
          {patient.clinical_conditions ? (
            <span style={{ fontWeight: '500' }}>{patient.clinical_conditions}</span>
          ) : (
            <span style={{ fontStyle: 'italic' }}>No conditions registered</span>
          )}
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--neutral-border)', margin: '0 0 12px 0' }}></div>

      {/* Bottom Section: Metadata Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--neutral-text)' }}>
          <Icons.Phone size={12} style={{ color: 'var(--neutral-muted)' }} />
          <span style={{ fontWeight: '600' }}>{patient.phone || '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--neutral-text)' }}>
          <Icons.Calendar size={12} style={{ color: 'var(--neutral-muted)' }} />
          <span style={{ fontWeight: '600' }}>{patient.age ? `${patient.age} yrs` : '—'}</span>
        </div>
      </div>
    </div>
  )
}