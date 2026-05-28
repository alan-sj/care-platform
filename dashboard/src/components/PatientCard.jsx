import { useNavigate } from 'react-router-dom'

export default function PatientCard({ patient }) {
  const navigate = useNavigate()
  const linked = !!patient.telegram_chat_id

  return (
    <div
      onClick={() => navigate(`/patients/${patient.id}`)}
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '12px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: 'box-shadow 0.2s'
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
    >
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>
          👤 {patient.name}
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          📞 {patient.phone} · Age: {patient.age || 'N/A'} · Lang: {patient.language}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{
          fontSize: '12px',
          fontWeight: '500',
          padding: '3px 10px',
          borderRadius: '12px',
          backgroundColor: linked ? '#d1fae5' : '#fef3c7',
          color: linked ? '#065f46' : '#92400e'
        }}>
          {linked ? '🟢 Linked' : '⚠️ Not linked'}
        </span>
        <div style={{ color: '#9ca3af', fontSize: '20px' }}>→</div>
      </div>
    </div>
  )
}