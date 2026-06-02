import { useState, useEffect } from 'react'
import { getTodaySchedule, generateSchedule, updateVisitStatus, getCoordinatorWorkload } from '../api/scheduling'
import * as Icons from '../components/Icons'

const priorityConfig = {
  urgent: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'URGENT', dot: '#dc2626' },
  high:   { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', label: 'HIGH',   dot: '#ea580c' },
  medium: { color: '#ca8a04', bg: '#fefce8', border: '#fde68a', label: 'MEDIUM', dot: '#ca8a04' },
  low:    { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'LOW',    dot: '#16a34a' },
}

const statusConfig = {
  planned:   { color: '#1d4ed8', bg: '#eff6ff', label: 'Planned' },
  confirmed: { color: '#059669', bg: '#ecfdf5', label: 'Confirmed' },
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
    <div className="card-premium" style={{ marginBottom: '12px', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: '15px', fontWeight: '700',
              color: 'var(--neutral-dark)', letterSpacing: '0.5px'
            }}>
              {visit.time_slot || '—:——'}
            </span>
            <span className="badge-premium" style={{ backgroundColor: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>
              {pc.label}
            </span>
            <span className="badge-premium" style={{ backgroundColor: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
          </div>

          <div className="card-text-primary" style={{ fontSize: '16px', marginBottom: '4px' }}>
            {visit.patient}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--neutral-muted)', marginBottom: '6px' }}>
            Coordinator: <span style={{ color: 'var(--neutral-dark)', fontWeight: '500' }}>{visit.coordinator}</span>
          </div>
          {visit.reason && (
            <div style={{ fontSize: '13px', color: 'var(--neutral-text)', marginBottom: '6px' }}>
              <span style={{ color: 'var(--neutral-muted)' }}>Reason: </span>{visit.reason}
            </div>
          )}
          {visit.notes && (
            <div style={{
              fontSize: '12px', color: 'var(--neutral-text)',
              backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-sm)',
              padding: '8px 12px', marginTop: '8px',
              borderLeft: '3px solid var(--neutral-border)'
            }}>
              {visit.notes}
            </div>
          )}
        </div>

        {['planned', 'confirmed'].includes(visit.status) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => setShowNoteInput(!showNoteInput)}
              disabled={updating}
              className="btn-premium btn-success"
              style={{ backgroundColor: 'var(--success-color)' }}
            >
              ✓ Mark Done
            </button>
            <button
              onClick={handleCancel}
              disabled={updating}
              className="btn-premium btn-primary-outline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {showNoteInput && ['planned', 'confirmed'].includes(visit.status) && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--neutral-border)' }}>
          <textarea
            placeholder="Add a quick note about this visit (optional)..."
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '13px',
              border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)',
              resize: 'vertical', minHeight: '60px', boxSizing: 'border-box',
              fontFamily: 'inherit', outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={handleComplete}
              disabled={updating}
              className="btn-premium btn-success"
            >
              {updating ? 'Saving...' : 'Confirm Complete'}
            </button>
            <button
              onClick={() => { setShowNoteInput(false); setNoteInput('') }}
              className="btn-premium btn-primary-outline"
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
    : filterStatus === 'planned'
      ? visits.filter(v => ['planned', 'confirmed'].includes(v.status))
      : visits.filter(v => v.status === filterStatus)

  const planned   = visits.filter(v => ['planned', 'confirmed'].includes(v.status)).length
  const completed = visits.filter(v => v.status === 'completed').length
  const urgent    = visits.filter(v => v.priority === 'urgent').length

  const pill = (label, value, active, onClick) => (
    <button
      onClick={onClick}
      className={`btn-premium ${active ? 'btn-success' : 'btn-primary-outline'}`}
      style={{
        padding: '6px 14px', borderRadius: '20px', fontSize: '13px',
        fontWeight: active ? '600' : '400',
        backgroundColor: active ? 'var(--primary-color)' : 'var(--card-bg)',
        color: active ? '#ffffff' : 'var(--neutral-text)',
        borderColor: active ? 'var(--primary-color)' : 'var(--neutral-border)'
      }}
    >
      {label} {value !== undefined && <span style={{ opacity: 0.8 }}>({value})</span>}
    </button>
  )

  return (
    <div className="page-container">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>
            Visit Schedule
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--neutral-muted)', margin: 0 }}>{today}</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-premium btn-success"
          style={{
            backgroundColor: generating ? 'var(--neutral-border)' : 'var(--primary-color)',
            color: '#ffffff',
            padding: '10px 20px',
            fontSize: '14px'
          }}
        >
          {generating ? 'Generating...' : 'Generate Schedule'}
        </button>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Total Visits', value: visits.length, color: 'var(--primary-color)' },
          { label: 'Planned', value: planned, color: 'var(--info-color)' },
          { label: 'Completed', value: completed, color: 'var(--success-color)' },
          { label: 'Urgent', value: urgent, color: 'var(--error-color)' },
        ].map(s => (
          <div key={s.label} className="card-premium" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ fontSize: '12px', color: 'var(--neutral-muted)', marginBottom: '6px', fontWeight: '600' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: s.color }}>{s.value}</div>
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
            <div style={{ textAlign: 'center', color: 'var(--neutral-muted)', padding: '48px', backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
              Loading schedule...
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Icons.Calendar size={24} style={{ color: 'var(--neutral-muted)' }} />
              <div style={{ color: 'var(--neutral-muted)', fontSize: '14px' }}>
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
          <div className="card-premium" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--neutral-dark)', marginBottom: '16px', margin: '0 0 16px' }}>
              Coordinator Workload
            </h3>
            {workload.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--neutral-muted)' }}>No coordinators found.</p>
            ) : (
              workload.map(c => {
                const pct = Math.round((c.visits_today / 5) * 100)
                const barColor = pct >= 100 ? 'var(--error-color)' : pct >= 80 ? 'var(--warning-color)' : 'var(--success-color)'
                return (
                  <div key={c.coordinator} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--neutral-text)' }}>
                        {c.coordinator}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--neutral-muted)', fontWeight: '600' }}>
                        {c.visits_today}/5
                      </span>
                    </div>
                    <div style={{ backgroundColor: 'var(--neutral-bg)', border: '1px solid var(--neutral-border)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(pct, 100)}%`, height: '100%',
                        backgroundColor: barColor, borderRadius: '4px',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', marginTop: '4px' }}>
                      {c.capacity_remaining} slot{c.capacity_remaining !== 1 ? 's' : ''} remaining · {c.total_patients} patients total
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {visits.length > 0 && (
            <div className="card-premium" style={{ padding: '20px', marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--neutral-dark)', margin: '0 0 12px' }}>
                Today's Progress
              </h3>
              <div style={{ fontSize: '13px', color: 'var(--neutral-text)', lineHeight: '1.8' }}>
                <div>Completed: <strong>{completed}</strong></div>
                <div>Remaining: <strong>{planned}</strong></div>
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--neutral-muted)' }}>Completion</span>
                    <span style={{ fontSize: '12px', color: 'var(--neutral-muted)', fontWeight: '600' }}>
                      {visits.length > 0 ? Math.round((completed / visits.length) * 100) : 0}%
                    </span>
                  </div>
                  <div style={{ backgroundColor: 'var(--neutral-bg)', border: '1px solid var(--neutral-border)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${visits.length > 0 ? (completed / visits.length) * 100 : 0}%`,
                      height: '100%', backgroundColor: 'var(--success-color)', borderRadius: '4px', transition: 'width 0.3s'
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