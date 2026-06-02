import { useState, useEffect } from 'react'
import { getTodaySchedule, generateSchedule, updateVisitStatus, getCoordinatorWorkload, createIndividualVisit } from '../api/scheduling'
import { getPatients } from '../api/patients'
import { getUsers } from '../api/users'
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
  cancelled_by_coordinator: { color: '#6b7280', bg: '#f9fafb', label: 'Cancelled by Coordinator' },
  cancelled_by_patient: { color: '#dc2626', bg: '#fef2f2', label: 'Declined by Patient' },
}

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateStr === todayStr) return 'Today';
  
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

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
      await updateVisitStatus(visit.id, 'cancelled_by_coordinator')
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
              fontFamily: 'monospace', fontSize: '14px', fontWeight: '700',
              color: 'var(--neutral-dark)', letterSpacing: '0.5px'
            }}>
              {formatDate(visit.schedule_date)} {visit.time_slot ? `at ${visit.time_slot}` : ''}
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

  const [patientList, setPatientList] = useState([])
  const [coordinatorList, setCoordinatorList] = useState([])
  const [showIndividualModal, setShowIndividualModal] = useState(false)
  const [individualForm, setIndividualForm] = useState({
    patient_id: '',
    coordinator_id: '',
    schedule_date: new Date().toLocaleDateString('sv-SE'),
    time_slot: '10:00',
    priority: 'medium',
    reason: '',
    notes: ''
  })

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  useEffect(() => {
    fetchSchedule()
    fetchDropdownData()
  }, [])

  const fetchDropdownData = async () => {
    try {
      const [patRes, usrRes] = await Promise.all([
        getPatients(),
        getUsers()
      ])
      setPatientList(patRes.data)
      const coords = usrRes.data.filter(u => u.role === 'coordinator')
      setCoordinatorList(coords)
      
      if (patRes.data.length > 0) {
        setIndividualForm(prev => ({
          ...prev,
          patient_id: patRes.data[0].id,
          coordinator_id: coords[0]?.id || ''
        }))
      }
    } catch (err) {
      console.error('Error fetching dropdown option data:', err)
    }
  }

  const handleIndividualSubmit = async (e) => {
    e.preventDefault()
    if (!individualForm.patient_id) {
      alert('Please select a patient.')
      return
    }
    try {
      await createIndividualVisit({
        patient_id: individualForm.patient_id,
        coordinator_id: individualForm.coordinator_id || null,
        schedule_date: individualForm.schedule_date || null,
        time_slot: individualForm.time_slot || null,
        priority: individualForm.priority,
        reason: individualForm.reason || null,
        notes: individualForm.notes || null
      })
      setShowIndividualModal(false)
      setIndividualForm(prev => ({
        ...prev,
        reason: '',
        notes: ''
      }))
      alert('Visit scheduled individually and patient notified on Telegram!')
      await fetchSchedule()
    } catch (err) {
      console.error(err)
      alert('Error scheduling individual visit.')
    }
  }

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
      : filterStatus === 'cancelled'
        ? visits.filter(v => v.status && v.status.startsWith('cancelled'))
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
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowIndividualModal(true)}
            className="btn-premium btn-primary-outline"
            style={{
              padding: '10px 20px',
              fontSize: '14px'
            }}
          >
            + Schedule Individual Visit
          </button>
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

      {showIndividualModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card-premium" style={{
            width: '100%', maxWidth: '480px', margin: 0, padding: '24px',
            backgroundColor: 'var(--card-bg)', border: '1px solid var(--neutral-border)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--neutral-dark)', marginBottom: '16px', marginTop: 0 }}>
              Schedule Individual Visit
            </h3>
            
            <form onSubmit={handleIndividualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  Patient *
                </label>
                <select
                  value={individualForm.patient_id}
                  onChange={e => setIndividualForm({ ...individualForm, patient_id: e.target.value })}
                  required
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: '14px',
                    border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)', outline: 'none'
                  }}
                >
                  <option value="" disabled>Select Patient</option>
                  {patientList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  Care Coordinator
                </label>
                <select
                  value={individualForm.coordinator_id}
                  onChange={e => setIndividualForm({ ...individualForm, coordinator_id: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: '14px',
                    border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)', outline: 'none'
                  }}
                >
                  <option value="">Unassigned</option>
                  {coordinatorList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    min={new Date().toLocaleDateString('sv-SE')}
                    value={individualForm.schedule_date}
                    onChange={e => setIndividualForm({ ...individualForm, schedule_date: e.target.value })}
                    required
                    style={{
                      width: '100%', padding: '8px 12px', fontSize: '14px',
                      border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)', outline: 'none'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    Time Slot
                  </label>
                  <input
                    type="time"
                    value={individualForm.time_slot}
                    onChange={e => setIndividualForm({ ...individualForm, time_slot: e.target.value })}
                    required
                    style={{
                      width: '100%', padding: '8px 12px', fontSize: '14px',
                      border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)', outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  Priority
                </label>
                <select
                  value={individualForm.priority}
                  onChange={e => setIndividualForm({ ...individualForm, priority: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: '14px',
                    border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)', outline: 'none'
                  }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  Reason for Visit
                </label>
                <input
                  type="text"
                  placeholder="e.g. Routine vitals check"
                  value={individualForm.reason}
                  onChange={e => setIndividualForm({ ...individualForm, reason: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: '14px',
                    border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  Notes
                </label>
                <textarea
                  placeholder="Additional instructions..."
                  value={individualForm.notes}
                  onChange={e => setIndividualForm({ ...individualForm, notes: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: '14px',
                    border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--card-bg)', color: 'var(--neutral-dark)',
                    minHeight: '60px', resize: 'vertical', outline: 'none', fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowIndividualModal(false)}
                  className="btn-premium btn-primary-outline"
                  style={{ padding: '8px 16px', fontSize: '14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-premium btn-success"
                  style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: 'var(--primary-color)', color: '#fff' }}
                >
                  Schedule Visit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}