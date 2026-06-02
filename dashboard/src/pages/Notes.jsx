import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingFollowups } from '../api/copilot'
import { getPatients } from '../api/patients'
import { getPatientNotes } from '../api/copilot'
import * as Icons from '../components/Icons'

const riskConfig = {
  none:   { color: 'var(--success-color)', bg: 'var(--success-bg)', label: 'No Risk' },
  low:    { color: 'var(--warning-color)', bg: 'var(--warning-bg)', label: 'Low Risk' },
  medium: { color: 'var(--warning-color)', bg: 'var(--warning-bg)', label: 'Medium Risk' },
  high:   { color: 'var(--error-color)', bg: 'var(--error-bg)', label: 'High Risk' },
}

const qualityConfig = {
  complete: { color: 'var(--success-color)', label: 'Complete' },
  partial:  { color: 'var(--warning-color)', label: 'Partial' },
  minimal:  { color: 'var(--error-color)', label: 'Minimal' },
}

function NoteCard({ note, patientName }) {
  const [expanded, setExpanded] = useState(false)
  const rc = riskConfig[note.risk_level] || riskConfig.none
  const qc = qualityConfig[note.note_quality] || qualityConfig.partial

  let vitals = {}
  let risks = []
  let meds = []
  try { vitals = JSON.parse(note.vitals || '{}') } catch {}
  try { risks = JSON.parse(note.risk_flags || '[]') } catch {}
  try { meds = JSON.parse(note.medications_given || '[]') } catch {}

  const hasVitals = Object.values(vitals).some(v => v && v !== 'null')

  const cardBorderColor = note.risk_level !== 'none' ? rc.color : 'var(--neutral-border)'

  return (
    <div className="card-premium" style={{ border: `1px solid ${cardBorderColor}`, marginBottom: '12px', overflow: 'hidden', padding: 0 }}>
      <div
        style={{ padding: '16px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{ fontWeight: '700', color: 'var(--neutral-dark)', fontSize: '15px' }}>
                {patientName}
              </span>
              <span className={`badge-premium ${note.risk_level === 'high' ? 'badge-danger' : note.risk_level === 'none' ? 'badge-success' : 'badge-warning'}`}>
                {rc.label}
              </span>
              <span style={{ fontSize: '12px', color: qc.color, fontWeight: '600' }}>{qc.label}</span>
              {note.follow_up_needed && (
                <span className="badge-premium badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Icons.Calendar size={11} /> Follow-up
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--neutral-text)', lineHeight: '1.5' }}>
              {note.visit_summary || 'No summary available.'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', marginTop: '8px' }}>
              {new Date(note.visit_date).toLocaleString()} · Coordinator: {note.coordinator || 'Unknown'}
            </div>
          </div>
          <div style={{ fontSize: '16px', color: 'var(--neutral-muted)', flexShrink: 0, paddingTop: '2px' }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--neutral-border)', padding: '16px 20px', backgroundColor: 'var(--neutral-bg)' }}>
          {/* Risk flags */}
          {risks.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--neutral-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Risk Flags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {risks.map((r, i) => (
                  <span key={i} className="badge-premium badge-danger" style={{ textTransform: 'none', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Icons.AlertTriangle size={11} /> {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Vitals */}
          {hasVitals && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--neutral-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vitals
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                {Object.entries(vitals).map(([k, v]) => v && v !== 'null' ? (
                  <div key={k} style={{
                    backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px', border: '1px solid var(--neutral-border)'
                  }}>
                    <div style={{ fontSize: '9px', color: 'var(--neutral-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k}</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--neutral-dark)' }}>{v}</div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {/* Medications given */}
          {meds.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--neutral-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Medications Given
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {meds.map((m, i) => (
                  <span key={i} className="badge-premium badge-success" style={{ textTransform: 'none', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Icons.Pill size={11} /> {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Observations */}
          {note.observations && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--neutral-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Observations
              </div>
              <p style={{ fontSize: '13px', color: 'var(--neutral-text)', lineHeight: '1.6', margin: 0 }}>
                {note.observations}
              </p>
            </div>
          )}

          {/* Follow-up note */}
          {note.follow_up_note && (
            <div className="card-premium" style={{
              backgroundColor: 'var(--info-bg)', border: '1px solid var(--info-color)',
              padding: '10px 14px', marginBottom: '14px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--info-color)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icons.Calendar size={12} /> Follow-up Required
              </div>
              <p style={{ fontSize: '13px', color: 'var(--neutral-dark)', margin: 0 }}>
                {note.follow_up_note}
              </p>
            </div>
          )}

          {/* Raw note */}
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--neutral-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Original Note
            </div>
            <div style={{
              backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px', border: '1px solid var(--neutral-border)',
              fontSize: '13px', color: 'var(--neutral-muted)', lineHeight: '1.6',
              fontStyle: 'italic'
            }}>
              "{note.raw_note}"
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Notes() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [allNotes, setAllNotes] = useState([])
  const [followups, setFollowups] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [filterPatient, setFilterPatient] = useState('all')

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data: pts } = await getPatients()
      setPatients(pts)

      const [notesResults, fuRes] = await Promise.all([
        Promise.allSettled(pts.map(p =>
          getPatientNotes(p.id).then(r => r.data.map(n => ({ ...n, patientId: p.id, patientName: p.name })))
        )),
        getPendingFollowups().catch(() => ({ data: { pending_followups: [] } }))
      ])

      const combined = notesResults
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))

      setAllNotes(combined)
      setFollowups(fuRes.data?.pending_followups || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const patientMap = Object.fromEntries(patients.map(p => [p.id, p.name]))

  const baseNotes = filterPatient === 'all'
    ? allNotes
    : allNotes.filter(n => n.patient_id === filterPatient)

  const displayNotes = tab === 'followups'
    ? baseNotes.filter(n => n.follow_up_needed)
    : tab === 'risks'
    ? baseNotes.filter(n => n.risk_level !== 'none')
    : baseNotes

  const tabBtn = (id, label, count) => {
    const isSelected = tab === id
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          padding: '8px 16px',
          borderRadius: 'var(--radius-md)',
          fontSize: '13px',
          cursor: 'pointer',
          fontWeight: '600',
          border: isSelected ? '1px solid var(--primary-color)' : '1px solid var(--neutral-border)',
          backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--card-bg)',
          color: isSelected ? 'var(--card-bg)' : 'var(--neutral-text)',
          transition: 'all 0.15s ease'
        }}
      >
        {label} {count !== undefined && <span style={{ opacity: 0.8 }}>({count})</span>}
      </button>
    )
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: '28px' }}>
        <h1 className="page-title" style={{ marginBottom: '6px' }}>
          Visit Notes
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--neutral-muted)', margin: 0 }}>
          Coordinator visit history and follow-up tracking (last 90 days)
        </p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'Total Notes', value: allNotes.length, color: 'var(--primary-color)', bg: 'var(--primary-bg)', icon: <Icons.FileText size={14} /> },
          { label: 'Follow-ups Due', value: allNotes.filter(n => n.follow_up_needed).length, color: 'var(--info-color)', bg: 'var(--info-bg)', icon: <Icons.Calendar size={14} /> },
          { label: 'Risk Flags', value: allNotes.filter(n => n.risk_level !== 'none').length, color: 'var(--warning-color)', bg: 'var(--warning-bg)', icon: <Icons.AlertTriangle size={14} /> },
          { label: 'High Risk Notes', value: allNotes.filter(n => n.risk_level === 'high').length, color: 'var(--error-color)', bg: 'var(--error-bg)', icon: <Icons.AlertTriangle size={14} /> },
        ].map(s => (
          <div key={s.label} className="card-premium" style={{ display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--neutral-muted)', fontWeight: '600' }}>{s.label}</span>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                backgroundColor: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: s.color
              }}>
                {s.icon}
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--neutral-dark)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tabBtn('all', 'All Notes', allNotes.length)}
          {tabBtn('followups', 'Follow-ups', allNotes.filter(n => n.follow_up_needed).length)}
          {tabBtn('risks', 'With Risks', allNotes.filter(n => n.risk_level !== 'none').length)}
        </div>
        <select
          value={filterPatient}
          onChange={e => setFilterPatient(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--neutral-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            backgroundColor: 'var(--card-bg)',
            color: 'var(--neutral-text)',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="all">All Patients</option>
          {patients.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="card-premium" style={{ textAlign: 'center', color: 'var(--neutral-muted)', padding: '48px' }}>
          Loading notes...
        </div>
      ) : displayNotes.length === 0 ? (
        <div className="empty-state-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <Icons.FileText size={24} style={{ color: 'var(--neutral-muted)' }} />
          <div style={{ color: 'var(--neutral-muted)', fontSize: '14px' }}>
            No notes found. Visit notes are submitted by coordinators after patient visits.
          </div>
        </div>
      ) : (
        displayNotes.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            patientName={note.patientName || patientMap[note.patient_id] || 'Unknown'}
          />
        ))
      )}
    </div>
  )
}