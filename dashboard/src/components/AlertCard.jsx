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

export default function AlertCard({ alert, patientName, onAcknowledge, onResolve }) {  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '16px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${severityColors[alert.severity] || '#6b7280'}`,
      marginBottom: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>
            {severityEmoji[alert.severity]} {typeLabel[alert.type] || alert.type}
          </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
              Patient: {patientName}
              </div>
          <div style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
            {alert.message}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            {new Date(alert.created_at).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
          {alert.status === 'open' && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              style={{
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Acknowledge
            </button>
          )}
          {alert.status !== 'resolved' && (
            <button
              onClick={() => onResolve(alert.id)}
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Resolve
            </button>
          )}
          <span style={{
            backgroundColor: alert.status === 'open' ? '#fee2e2' : alert.status === 'acknowledged' ? '#fef3c7' : '#d1fae5',
            color: alert.status === 'open' ? '#ef4444' : alert.status === 'acknowledged' ? '#f59e0b' : '#10b981',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            alignSelf: 'center'
          }}>
            {alert.status.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}