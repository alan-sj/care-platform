export default function StatCard({ title, value, color = '#1e3a5f', icon }) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
      minWidth: '180px',
      flex: 1
    }}>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color }}>
        {value}
      </div>
    </div>
  )
}