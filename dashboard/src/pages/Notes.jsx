import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingFollowups } from '../api/copilot'
import { getPatients } from '../api/patients'
import { getPatientNotes } from '../api/copilot'

const riskColors = {
  none:   { color: '#16a34a', bg: '#f0fdf4', label: 'No Risk' },
  low:    { color: '#ca8a04', bg: '#fefce8', label: 'Low' },
  medium: { color: '#ea580c', bg: '#fff7ed', label: 'Medium' },
  high:   { color: '#dc2626', bg: '#fef2f2', label: 'High' },
}

const qualityConfig = {
  complete: { color: '#16a34a', label: '✅ Complete' },
  partial:  { color: '#ca8a04', label: '⚠️ Partial' },
  minimal:  { color: '#dc2626', label: '❌ Minimal' },
}

function NoteCard({ note, patientName }) {
  const [expanded, setExpanded] = useState(false)
  const rc = riskColors[note.risk_level] || riskColors.none
  const qc = qualityConfig[note.note_quality] || qualityConfig.partial

  let vitals = {}
  let risks = []
  let meds = []
  try { vitals = JSON.parse(note.vitals || '{}') } catch {}
  try { risks = JSON.parse(note.risk_flags || '[]') } catch {}
  try { meds = JSON.parse(note.medications_given || '[]') } catch {}

  const hasVitals = Object.values(vitals).some(v => v && v !== 'null')

  return (
    <div style={{
      backgroundColor: 'white', borderRadius: '10px',
      border: `1px solid ${note.risk_level !== 'none' ? rc.bg : '#f1f5f9'}`,
      borderLeft: `4px solid ${rc.color}`,
      marginBottom: '12px', overflow: 'hidden'
    }}>
      <div
        style={{ padding: '16px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px' }}>
                {patientName}
              </span>
              <span style={{
                backgroundColor: rc.bg, color: rc.color,
                fontSize: '11px', fontWeight: '600',
                padding: '2px 8px', borderRadius: '4px'
              }}>
                {rc.label}
              </span>
              <span style={{ fontSize: '12px', color: qc.color }}>{qc.label}</span>
              {note.follow_up_needed && (
                <span style={{
                  backgroundColor: '#eff6ff', color: '#1d4ed8',
                  fontSize: '11px', fontWeight: '600',
                  padding: '2px 8px', borderRadius: '4px'
                }}>
                  📌 Follow-up
                </span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
              {note.visit_summary || 'No summary available.'}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
              {new Date(note.visit_date).toLocaleString()} · Coordinator: {note.coordinator || 'Unknown'}
            </div>
          </div>
          <div style={{ fontSize: '18px', color: '#94a3b8', flexShrink: 0, paddingTop: '2px' }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', backgroundColor: '#fafafa' }}>
          {/* Risk flags */}
          {risks.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Risk Flags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {risks.map((r, i) => (
                  <span key={i} style={{
                    backgroundColor: '#fef2f2', color: '#dc2626',
                    fontSize: '12px', padding: '3px 8px', borderRadius: '4px',
                    border: '1px solid #fecaca'
                  }}>
                    ⚠️ {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Vitals */}
          {hasVitals && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vitals
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px' }}>
                {Object.entries(vitals).map(([k, v]) => v && v !== 'null' ? (
                  <div key={k} style={{
                    backgroundColor: 'white', borderRadius: '6px',
                    padding: '6px 10px', border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k}</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{v}</div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {/* Medications given */}
          {meds.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Medications Given
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {meds.map((m, i) => (
                  <span key={i} style={{
                    backgroundColor: '#f0fdf4', color: '#16a34a',
                    fontSize: '12px', padding: '3px 8px', borderRadius: '4px',
                    border: '1px solid #bbf7d0'
                  }}>
                    💊 {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Observations */}
          {note.observations && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Observations
              </div>
              <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6', margin: 0 }}>
                {note.observations}
              </p>
            </div>
          )}

          {/* Follow-up note */}
          {note.follow_up_note && (
            <div style={{
              backgroundColor: '#eff6ff', borderRadius: '6px',
              padding: '10px 14px', borderLeft: '3px solid #1d4ed8'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#1d4ed8', marginBottom: '4px' }}>
                📌 Follow-up Required
              </div>
              <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>
                {note.follow_up_note}
              </p>
            </div>
          )}

          {/* Raw note */}
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Original Note
            </div>
            <div style={{
              backgroundColor: 'white', borderRadius: '6px',
              padding: '10px 14px', border: '1px solid #e5e7eb',
              fontSize: '13px', color: '#6b7280', lineHeight: '1.6',
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

  const tabBtn = (id, label, count) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '7px 16px', borderRadius: '6px', fontSize: '13px',
        cursor: 'pointer', fontWeight: tab === id ? '600' : '400',
        border: tab === id ? '1.5px solid #1e3a5f' : '1px solid #e5e7eb',
        backgroundColor: tab === id ? '#1e3a5f' : 'white',
        color: tab === id ? 'white' : '#374151'
      }}
    >
      {label} {count !== undefined && <span style={{ opacity: 0.7 }}>({count})</span>}
    </button>
  )

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e3a5f', marginBottom: '4px' }}>
          Visit Notes
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          Coordinator visit history and follow-up tracking (last 90 days)
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Notes', value: allNotes.length, color: '#1e3a5f' },
          { label: 'Follow-ups Due', value: allNotes.filter(n => n.follow_up_needed).length, color: '#1d4ed8' },
          { label: 'Risk Flags', value: allNotes.filter(n => n.risk_level !== 'none').length, color: '#dc2626' },
          { label: 'High Risk Notes', value: allNotes.filter(n => n.risk_level === 'high').length, color: '#ea580c' },
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

      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tabBtn('all', 'All Notes', allNotes.length)}
          {tabBtn('followups', 'Follow-ups', allNotes.filter(n => n.follow_up_needed).length)}
          {tabBtn('risks', 'With Risks', allNotes.filter(n => n.risk_level !== 'none').length)}
        </div>
        <select
          value={filterPatient}
          onChange={e => setFilterPatient(e.target.value)}
          style={{
            padding: '6px 12px', border: '1px solid #e5e7eb',
            borderRadius: '6px', fontSize: '13px', backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Patients</option>
          {patients.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px', backgroundColor: 'white', borderRadius: '10px' }}>
          Loading notes...
        </div>
      ) : displayNotes.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '10px',
          padding: '48px', textAlign: 'center',
          border: '1px dashed #e2e8f0'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📝</div>
          <div style={{ color: '#64748b', fontSize: '14px' }}>
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