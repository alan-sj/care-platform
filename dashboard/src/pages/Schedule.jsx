import { useState, useEffect } from 'react'
import { getTodaySchedule, generateSchedule, updateVisitStatus, getCoordinatorWorkload } from '../api/scheduling'

const priorityConfig = {
  urgent: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'URGENT', dot: '#dc2626' },
  high:   { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', label: 'HIGH',   dot: '#ea580c' },
  medium: { color: '#ca8a04', bg: '#fefce8', border: '#fde68a', label: 'MEDIUM', dot: '#ca8a04' },
  low:    { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'LOW',    dot: '#16a34a' },
}

const statusConfig = {
  planned:   { color: '#1d4ed8', bg: '#eff6ff', label: 'Planned' },
  completed: { color: '#16a34a', bg: '#f0fdf4', label: 'Completed' },
  cancelled: { color: '#6b7280', bg: '#f9fafb', label: 'Cancelled' },
}

function VisitCard({ visit, onStatusUpdate }) {
  const [updating, setUpdating] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const pc = priorityConfig[visit.priority] || priorityConfig.medium
  const sc = statusConfig[visit.status] || statusConfig.planned

  const handleComplete = async () => {
    if (showNoteInput && !noteInput.trim()) {
      setShowNoteInput(false)
      return
    }
    setUpdating(true)
    try {
      await updateVisitStatus(visit.id, 'completed', noteInput || null)
      onStatusUpdate()
    } finally {
      setUpdating(false)
      setShowNoteInput(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel this visit?')) return
    setUpdating(true)
    try {
      await updateVisitStatus(visit.id, 'cancelled')
      onStatusUpdate()
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '10px',
      border: `1px solid ${pc.border}`,
      borderLeft: `4px solid ${pc.dot}`,
      padding: '16px 20px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: '15px', fontWeight: '700',
              color: '#1e3a5f', letterSpacing: '0.5px'
            }}>
              {visit.time_slot || '—:——'}
            </span>
            <span style={{
              backgroundColor: pc.bg, color: pc.color,
              fontSize: '10px', fontWeight: '700', letterSpacing: '1px',
              padding: '2px 8px', borderRadius: '4px', border: `1px solid ${pc.border}`
            }}>
              {pc.label}
            </span>
            <span style={{
              backgroundColor: sc.bg, color: sc.color,
              fontSize: '11px', fontWeight: '500',
              padding: '2px 8px', borderRadius: '4px'
            }}>
              {sc.label}
            </span>
          </div>

          <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
            {visit.patient}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
            Coordinator: {visit.coordinator}
          </div>
          {visit.reason && (
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
              <span style={{ color: '#9ca3af' }}>Reason: </span>{visit.reason}
            </div>
          )}
          {visit.notes && (
            <div style={{
              fontSize: '12px', color: '#6b7280',
              backgroundColor: '#f8fafc', borderRadius: '6px',
              padding: '6px 10px', marginTop: '6px',
              borderLeft: '3px solid #e2e8f0'
            }}>
              {visit.notes}
            </div>
          )}
        </div>

        {visit.status === 'planned' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => setShowNoteInput(!showNoteInput)}
              disabled={updating}
              style={{
                backgroundColor: '#10b981', color: 'white',
                border: 'none', borderRadius: '6px',
                padding: '7px 14px', cursor: 'pointer', fontSize: '13px',
                fontWeight: '500'
              }}
            >
              ✓ Mark Done
            </button>
            <button
              onClick={handleCancel}
              disabled={updating}
              style={{
                backgroundColor: 'transparent', color: '#6b7280',
                border: '1px solid #e5e7eb', borderRadius: '6px',
                padding: '6px 14px', cursor: 'pointer', fontSize: '12px'
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {showNoteInput && visit.status === 'planned' && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
          <textarea
            placeholder="Add a quick note about this visit (optional)..."
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '13px',
              border: '1px solid #e5e7eb', borderRadius: '6px',
              resize: 'vertical', minHeight: '60px', boxSizing: 'border-box',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={handleComplete}
              disabled={updating}
              style={{
                backgroundColor: '#10b981', color: 'white',
                border: 'none', borderRadius: '6px',
                padding: '6px 16px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              {updating ? 'Saving...' : 'Confirm Complete'}
            </button>
            <button
              onClick={() => { setShowNoteInput(false); setNoteInput('') }}
              style={{
                backgroundColor: 'transparent', color: '#6b7280',
                border: '1px solid #e5e7eb', borderRadius: '6px',
                padding: '6px 12px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Schedule() {
  const [schedule, setSchedule] = useState(null)
  const [workload, setWorkload] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  useEffect(() => {
    fetchSchedule()
  }, [])

  const fetchSchedule = async () => {
    setLoading(true)
    try {
      const [schedRes, workRes] = await Promise.all([
        getTodaySchedule(),
        getCoordinatorWorkload(),
      ])
      setSchedule(schedRes.data)
      setWorkload(workRes.data.coordinators || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!confirm('Generate a new visit schedule for today? This will clear any unconfirmed planned visits.')) return
    setGenerating(true)
    try {
      await generateSchedule()
      await fetchSchedule()
    } catch (err) {
      console.error(err)
      alert('Schedule generation failed. Check that patients and coordinators are set up.')
    } finally {
      setGenerating(false)
    }
  }

  const visits = schedule?.visits || []
  const filtered = filterStatus === 'all'
    ? visits
    : visits.filter(v => v.status === filterStatus)

  const planned   = visits.filter(v => v.status === 'planned').length
  const completed = visits.filter(v => v.status === 'completed').length
  const urgent    = visits.filter(v => v.priority === 'urgent').length

  const pill = (label, value, active, onClick) => (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: '20px', fontSize: '13px',
        cursor: 'pointer', fontWeight: active ? '600' : '400',
        border: active ? '1.5px solid #1e3a5f' : '1px solid #e5e7eb',
        backgroundColor: active ? '#1e3a5f' : 'white',
        color: active ? 'white' : '#374151'
      }}
    >
      {label} {value !== undefined && <span style={{ opacity: 0.7 }}>({value})</span>}
    </button>
  )

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e3a5f', marginBottom: '2px' }}>
            Visit Schedule
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{today}</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            backgroundColor: generating ? '#94a3b8' : '#1e3a5f',
            color: 'white', border: 'none', borderRadius: '8px',
            padding: '10px 20px', cursor: generating ? 'not-allowed' : 'pointer',
            fontSize: '14px', fontWeight: '500'
          }}
        >
          {generating ? '⚙️ Generating...' : '⚡ Generate Schedule'}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Visits', value: visits.length, color: '#1e3a5f' },
          { label: 'Planned', value: planned, color: '#1d4ed8' },
          { label: 'Completed', value: completed, color: '#16a34a' },
          { label: 'Urgent', value: urgent, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{
            backgroundColor: 'white', borderRadius: '8px',
            padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
            borderLeft: `3px solid ${s.color}`
          }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'start' }}>

        {/* Visits list */}
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {pill('All', visits.length, filterStatus === 'all', () => setFilterStatus('all'))}
            {pill('Planned', planned, filterStatus === 'planned', () => setFilterStatus('planned'))}
            {pill('Completed', completed, filterStatus === 'completed', () => setFilterStatus('completed'))}
            {pill('Cancelled', null, filterStatus === 'cancelled', () => setFilterStatus('cancelled'))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px', backgroundColor: 'white', borderRadius: '10px' }}>
              Loading schedule...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              backgroundColor: 'white', borderRadius: '10px',
              padding: '48px', textAlign: 'center',
              border: '1px dashed #e2e8f0'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
              <div style={{ color: '#64748b', fontSize: '14px' }}>
                {visits.length === 0
                  ? 'No visits scheduled today. Click "Generate Schedule" to create today\'s plan.'
                  : `No ${filterStatus} visits.`}
              </div>
            </div>
          ) : (
            filtered.map(visit => (
              <VisitCard key={visit.id} visit={visit} onStatusUpdate={fetchSchedule} />
            ))
          )}
        </div>

        {/* Sidebar: coordinator workload */}
        <div>
          <div style={{
            backgroundColor: 'white', borderRadius: '10px',
            padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f', marginBottom: '16px', margin: '0 0 16px' }}>
              Coordinator Workload
            </h3>
            {workload.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>No coordinators found.</p>
            ) : (
              workload.map(c => {
                const pct = Math.round((c.visits_today / 5) * 100)
                const barColor = pct >= 100 ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#10b981'
                return (
                  <div key={c.coordinator} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                        {c.coordinator}
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {c.visits_today}/5
                      </span>
                    </div>
                    <div style={{ backgroundColor: '#f1f5f9', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(pct, 100)}%`, height: '100%',
                        backgroundColor: barColor, borderRadius: '4px',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                      {c.capacity_remaining} slot{c.capacity_remaining !== 1 ? 's' : ''} remaining · {c.total_patients} patients total
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Progress summary */}
          {visits.length > 0 && (
            <div style={{
              backgroundColor: 'white', borderRadius: '10px',
              padding: '20px', marginTop: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f', margin: '0 0 12px' }}>
                Today's Progress
              </h3>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.8' }}>
                <div>✅ Completed: <strong>{completed}</strong></div>
                <div>⏳ Remaining: <strong>{planned}</strong></div>
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Completion</span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {visits.length > 0 ? Math.round((completed / visits.length) * 100) : 0}%
                    </span>
                  </div>
                  <div style={{ backgroundColor: '#f1f5f9', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${visits.length > 0 ? (completed / visits.length) * 100 : 0}%`,
                      height: '100%', backgroundColor: '#10b981', borderRadius: '4px', transition: 'width 0.3s'
                    }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}