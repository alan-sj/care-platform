export default function StatCard({ title, value, color = '#6366f1', icon }) {
  const isAlert = title.toLowerCase().includes('alert');
  const isPriority = title.toLowerCase().includes('priority');
  
  let badgeClass = 'badge-success';
  let badgeLabel = null;
  
  if (isAlert) {
    if (value > 0) {
      badgeClass = 'badge-danger';
      badgeLabel = 'Attention Required';
    } else {
      badgeClass = 'badge-success';
      badgeLabel = 'All Clear';
    }
  } else if (isPriority) {
    if (value > 0) {
      badgeClass = 'badge-danger';
      badgeLabel = 'Critical';
    } else {
      badgeClass = 'badge-success';
      badgeLabel = 'All Clear';
    }
  } else if (title.toLowerCase().includes('total')) {
    badgeLabel = null;
  } else if (title.toLowerCase().includes('active')) {
    badgeClass = 'badge-success';
    badgeLabel = 'Active';
  } else {
    badgeLabel = 'Active';
  }

  return (
    <div className="card-premium stat-card-premium" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div 
            style={{ 
              width: '28px', 
              height: '28px', 
              borderRadius: 'var(--radius-sm)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: 'var(--neutral-bg)', 
              color: 'var(--neutral-dark)',
              fontSize: '14px',
              border: '1px solid var(--neutral-border)'
            }}
          >
            {icon}
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--neutral-muted)' }}>
            {title}
          </div>
        </div>
        <span style={{ color: 'var(--neutral-muted)', fontSize: '13px', cursor: 'help' }}>ⓘ</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--neutral-dark)' }}>
          {value}
        </span>
        {badgeLabel && (
          <span 
            className={`badge-premium ${badgeClass}`}
            style={{ 
              fontSize: '11px', 
              fontWeight: '700', 
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'none',
              letterSpacing: 'normal',
              marginLeft: '8px',
              whiteSpace: 'nowrap'
            }}
          >
            {badgeLabel}
          </span>
        )}
      </div>
    </div>
  )
}