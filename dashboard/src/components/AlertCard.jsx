const severityColors = {
  low: '#f59e0b',
  medium: '#f97316',
  high: '#ef4444',
  critical: '#7c3aed'
}

const severityEmoji = {
  low: '🟡',
  medium: '🟠',
  high: '🔴',
  critical: '🚨'
}

const typeLabel = {
  missed_medication: 'Missed Medication',
  no_response: 'No Response',
  flagged: 'Health Concern'
}

export default function AlertCard({ alert, patientName, onAcknowledge, onResolve }) {
  const isCritical = alert.severity === 'critical' || alert.severity === 'high';
  const badgeClass = isCritical ? 'badge-danger' : 'badge-warning';

  return (
    <div className="card-premium">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className={`badge-premium ${badgeClass}`}>
              {alert.severity}
            </span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--neutral-dark)' }}>
              {typeLabel[alert.type] || alert.type}
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--neutral-muted)', marginBottom: '6px' }}>
            Patient: <span style={{ color: 'var(--neutral-dark)' }}>{patientName}</span>
          </div>
          <div style={{ fontSize: '14px', color: 'var(--neutral-text)', marginBottom: '12px', lineHeight: '1.6' }}>
            {alert.message}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--neutral-muted)' }}>
            Created: {new Date(alert.created_at).toLocaleString()}
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {alert.status === 'open' && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="btn-premium btn-warning"
            >
              Acknowledge
            </button>
          )}
          {alert.status !== 'resolved' && (
            <button
              onClick={() => onResolve(alert.id)}
              className="btn-premium btn-success"
            >
              Resolve
            </button>
          )}
          <span 
            className={`badge-premium badge-${
              alert.status === 'open' ? 'danger' : alert.status === 'acknowledged' ? 'warning' : 'success'
            }`}
            style={{ padding: '6px 12px' }}
          >
            {alert.status}
          </span>
        </div>
      </div>
    </div>
  )
}