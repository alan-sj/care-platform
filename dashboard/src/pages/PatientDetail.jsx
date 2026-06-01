import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPatient, getOnboardingLink } from '../api/patients'
import { getPatientMedications, createMedication, deleteMedication, getPatientLogs } from '../api/medications'
import { getFamilyContacts, createFamilyContact, deleteFamilyContact, getFamilyOnboardingLink } from '../api/family'
import { getLatestWellnessScore } from '../api/wellness'
import { getPatientRiskStatus } from '../api/emergency'
import { submitVisitNote, getPatientNotes } from '../api/copilot'

const statusColors = { confirmed: '#10b981', missed: '#ef4444', flagged: '#f97316', pending: '#6b7280' }
const statusEmoji  = { confirmed: '✅', missed: '❌', flagged: '🟠', pending: '⏳' }

const riskLevelConfig = {
  none:     { color: '#16a34a', bg: '#f0fdf4', label: 'No Risk',  icon: '✅' },
  low:      { color: '#ca8a04', bg: '#fefce8', label: 'Low Risk', icon: '🟡' },
  medium:   { color: '#ea580c', bg: '#fff7ed', label: 'Medium',   icon: '🟠' },
  high:     { color: '#dc2626', bg: '#fef2f2', label: 'High',     icon: '🔴' },
  critical: { color: '#7c3aed', bg: '#f5f3ff', label: 'Critical', icon: '🚨' },
}

const scoreColor = (score) => {
  if (!score) return { color: '#9ca3af', label: '—' }
  if (score >= 8) return { color: '#16a34a', label: `${score}/10 — Good` }
  if (score >= 6) return { color: '#ca8a04', label: `${score}/10 — Fair` }
  if (score >= 4) return { color: '#ea580c', label: `${score}/10 — Low` }
  return { color: '#dc2626', label: `${score}/10 — Critical` }
}

function WellnessCard({ wellness }) {
  if (!wellness || wellness.score === null) {
    return (
      <div style={{
        backgroundColor: '#f9fafb', borderRadius: '8px',
        padding: '14px 16px', border: '1px solid #f1f5f9',
        textAlign: 'center', color: '#9ca3af', fontSize: '13px'
      }}>
        No wellness check-in data yet.
      </div>
    )
  }
  const sc = scoreColor(wellness.score)
  return (
    <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '14px 16px', border: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '22px', fontWeight: '700', color: sc.color }}>{sc.label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {[
          ['Mood', wellness.mood],
          ['Pain', wellness.pain],
          ['Eating', wellness.eating],
          ['Sleep', wellness.sleep],
        ].map(([label, value]) => (
          <div key={label} style={{ backgroundColor: 'white', borderRadius: '6px', padding: '6px 10px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>{value || '—'}</div>
          </div>
        ))}
      </div>
      {wellness.concerns && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#92400e', backgroundColor: '#fffbeb', borderRadius: '6px', padding: '6px 10px', borderLeft: '3px solid #fbbf24' }}>
          ⚠️ {wellness.concerns}
        </div>
      )}
      {wellness.checked_at && (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
          Last checked: {new Date(wellness.checked_at).toLocaleString()}
        </div>
      )}
    </div>
  )
}

function VisitNoteForm({ patientId, onSubmitted }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const handleSubmit = async () => {
    if (!note.trim()) return
    setSubmitting(true)
    try {
      const res = await submitVisitNote(patientId, note)
      setResult(res.data.structured)
      setNote('')
      onSubmitted()
    } catch (err) {
      console.error(err)
      alert('Failed to submit visit note. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const riskColors = { none: '#16a34a', low: '#ca8a04', medium: '#ea580c', high: '#dc2626' }

  return (
    <div style={{ marginTop: '20px' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%', padding: '12px', backgroundColor: '#1e3a5f',
            color: 'white', border: 'none', borderRadius: '8px',
            cursor: 'pointer', fontSize: '14px', fontWeight: '500'
          }}
        >
          📝 Submit Visit Note
        </button>
      ) : (
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f', marginBottom: '8px' }}>
            New Visit Note
          </div>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px', margin: '0 0 10px' }}>
            Describe the visit naturally — vitals, observations, medications given, any concerns. The AI will structure it automatically.
          </p>
          <textarea
            placeholder="e.g. Visited Mrs. Ahmed at 2pm. BP was 138/88, pulse 72. She took her Metformin and Lisinopril. Seemed a bit more tired than usual, mentioned lower back pain (mild). Had eaten lunch. Flat is tidy and warm. Follow up on back pain next visit."
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '13px',
              border: '1px solid #d1d5db', borderRadius: '6px',
              resize: 'vertical', minHeight: '100px', boxSizing: 'border-box',
              fontFamily: 'inherit', lineHeight: '1.5'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || !note.trim()}
              style={{
                backgroundColor: submitting ? '#94a3b8' : '#1e3a5f',
                color: 'white', border: 'none', borderRadius: '6px',
                padding: '8px 20px', cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: '500'
              }}
            >
              {submitting ? 'Processing...' : 'Submit & Analyse'}
            </button>
            <button
              onClick={() => { setOpen(false); setNote(''); setResult(null) }}
              style={{
                backgroundColor: 'transparent', color: '#6b7280',
                border: '1px solid #e5e7eb', borderRadius: '6px',
                padding: '8px 14px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              Cancel
            </button>
          </div>

          {result && (
            <div style={{ marginTop: '14px', padding: '12px 14px', backgroundColor: 'white', borderRadius: '8px', border: `1px solid ${result.risk_level !== 'none' ? '#fecaca' : '#bbf7d0'}` }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: riskColors[result.risk_level] || '#374151', marginBottom: '6px' }}>
                ✓ Processed — Risk: {result.risk_level?.toUpperCase() || 'NONE'}
              </div>
              {result.visit_summary && (
                <p style={{ fontSize: '12px', color: '#374151', margin: '0 0 6px', lineHeight: '1.5' }}>
                  {result.visit_summary}
                </p>
              )}
              {result.risk_flags?.length > 0 && (
                <div style={{ fontSize: '12px', color: '#dc2626' }}>
                  ⚠️ Flags: {result.risk_flags.join(', ')}
                </div>
              )}
              {result.follow_up_needed && result.follow_up_note && (
                <div style={{ fontSize: '12px', color: '#1d4ed8', marginTop: '4px' }}>
                  📌 {result.follow_up_note}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient]     = useState(null)
  const [medications, setMedications] = useState([])
  const [logs, setLogs]           = useState([])
  const [familyContacts, setFamilyContacts] = useState([])
  const [onboarding, setOnboarding] = useState(null)
  const [wellness, setWellness]   = useState(null)
  const [riskStatus, setRiskStatus] = useState(null)
  const [recentNotes, setRecentNotes] = useState([])
  const [loading, setLoading]     = useState(true)
  const [copied, setCopied]       = useState(false)
  const [familyLinks, setFamilyLinks] = useState({})
  const [copiedContact, setCopiedContact] = useState(null)
  const [showMedForm, setShowMedForm]   = useState(false)
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [medForm, setMedForm]   = useState({ name: '', dosage: '', frequency: 'daily', times: '' })
  const [familyForm, setFamilyForm] = useState({ name: '', phone: '', relation: '' })

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const [patientRes, medsRes, logsRes, familyRes, onboardingRes] = await Promise.all([
        getPatient(id),
        getPatientMedications(id),
        getPatientLogs(id),
        getFamilyContacts(id),
        getOnboardingLink(id),
      ])
      setPatient(patientRes.data)
      setMedications(medsRes.data)
      setLogs(logsRes.data)
      setFamilyContacts(familyRes.data)
      setOnboarding(onboardingRes.data)

      const [wellRes, riskRes, notesRes, fLinks] = await Promise.all([
        getLatestWellnessScore(id).catch(() => ({ data: null })),
        getPatientRiskStatus(id).catch(() => ({ data: null })),
        getPatientNotes(id).catch(() => ({ data: [] })),
        Promise.all(familyRes.data.map(c =>
          getFamilyOnboardingLink(c.id).then(r => [c.id, r.data]).catch(() => null)
        )),
      ])
      setWellness(wellRes.data)
      setRiskStatus(riskRes.data)
      setRecentNotes((notesRes.data || []).slice(0, 3))
      const links = {}
      fLinks.filter(Boolean).forEach(([cid, data]) => { links[cid] = data })
      setFamilyLinks(links)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (!onboarding) return
    navigator.clipboard.writeText(onboarding.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyFamilyLink = (contactId) => {
    const link = familyLinks[contactId]
    if (!link) return
    navigator.clipboard.writeText(link.link)
    setCopiedContact(contactId)
    setTimeout(() => setCopiedContact(null), 2000)
  }

  const handleAddMedication = async () => {
    try {
      await createMedication({
        patient_id: id, name: medForm.name, dosage: medForm.dosage,
        frequency: medForm.frequency,
        times: medForm.times.split(',').map(t => t.trim()),
        active: true
      })
      setShowMedForm(false)
      setMedForm({ name: '', dosage: '', frequency: 'daily', times: '' })
      fetchData()
    } catch { alert('Error adding medication') }
  }

  const handleDeleteMedication = async (medId) => {
    if (!confirm('Delete this medication?')) return
    await deleteMedication(medId)
    fetchData()
  }

  const handleAddFamily = async () => {
    try {
      await createFamilyContact({ patient_id: id, ...familyForm })
      setShowFamilyForm(false)
      setFamilyForm({ name: '', phone: '', relation: '' })
      fetchData()
    } catch { alert('Error adding family contact') }
  }

  const handleDeleteFamily = async (contactId) => {
    if (!confirm('Remove this family contact?')) return
    await deleteFamilyContact(contactId)
    fetchData()
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
  if (!patient) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Patient not found</div>

  const rc = riskLevelConfig[riskStatus?.risk_level || 'none']
  const card  = { backgroundColor: 'white', borderRadius: '8px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }
  const btnP  = { backgroundColor: '#1a56db', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }
  const btnS  = { backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer' }
  const btnD  = { backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }
  const input = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <button onClick={() => navigate('/patients')} style={{ backgroundColor: 'transparent', border: 'none', color: '#1a56db', cursor: 'pointer', fontSize: '14px', marginBottom: '16px', padding: 0 }}>
        ← Back to Patients
      </button>

      {/* Patient Header with risk badge */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '8px' }}>
              👤 {patient.name}
            </h1>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>📞 {patient.phone}</span>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>🎂 Age: {patient.age || 'N/A'}</span>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>🌐 {patient.language}</span>
              <span style={{ fontSize: '14px', color: patient.telegram_chat_id ? '#10b981' : '#f97316', fontWeight: '500' }}>
                {patient.telegram_chat_id ? '🟢 Telegram Linked' : '⚠️ Not Linked'}
              </span>
            </div>
          </div>
          {/* Risk + wellness snapshot */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{
              backgroundColor: rc.bg, borderRadius: '8px', padding: '10px 16px',
              border: `1px solid`, borderColor: rc.color + '40', textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Risk Status</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: rc.color }}>
                {rc.icon} {rc.label}
              </div>
              {riskStatus?.open_alerts > 0 && (
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {riskStatus.open_alerts} open alert{riskStatus.open_alerts !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            {wellness?.score !== null && wellness?.score !== undefined && (
              <div style={{
                backgroundColor: '#f8fafc', borderRadius: '8px', padding: '10px 16px',
                border: '1px solid #e5e7eb', textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Wellness</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: scoreColor(wellness.score).color }}>
                  {wellness.score}/10
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding link banner */}
      {onboarding && !onboarding.linked && (
        <div style={{ ...card, border: '1px solid #fbbf24', backgroundColor: '#fffbeb', padding: '16px 24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#92400e', marginBottom: '4px' }}>
            📲 Connect Patient to Telegram
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', backgroundColor: 'white', borderRadius: '6px', padding: '10px 14px', border: '1px solid #fde68a' }}>
            <span style={{ flex: 1, fontSize: '13px', color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {onboarding.link}
            </span>
            <button onClick={handleCopyLink} style={{ backgroundColor: copied ? '#10b981' : '#1a56db', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#92400e', marginTop: '6px', margin: '6px 0 0' }}>
            Code: <b>{onboarding.onboarding_code}</b>
          </p>
        </div>
      )}
      {onboarding?.linked && (
        <div style={{ ...card, border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', padding: '14px 24px' }}>
          <p style={{ fontSize: '14px', color: '#065f46', margin: 0 }}>
            ✅ <b>Telegram connected.</b> Reminders and alerts are being delivered.
          </p>
        </div>
      )}

      {/* Two-column layout: left=wellness+activity, right=visit note */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* Wellness */}
        <div style={card}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '16px' }}>
            🌟 Latest Wellness
          </h2>
          <WellnessCard wellness={wellness} />
        </div>

        {/* Today's activity */}
        <div style={card}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '16px' }}>
            📋 Today's Activity
          </h2>
          {logs.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px' }}>No activity logged today.</p>
          ) : (
            logs.map(log => (
              <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: statusColors[log.status], marginRight: '8px' }}>
                    {statusEmoji[log.status]} {log.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    {log.patient_reply ? `"${log.patient_reply}"` : 'No reply'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent visit notes + submit form */}
      <div style={card}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '16px' }}>
          📝 Visit Notes
        </h2>

        {recentNotes.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>No visit notes recorded yet.</p>
        ) : (
          recentNotes.map(note => {
            const rc2 = riskLevelConfig[note.risk_level] || riskLevelConfig.none
            let risks = []
            try { risks = JSON.parse(note.risk_flags || '[]') } catch {}
            return (
              <div key={note.id} style={{
                backgroundColor: '#f8fafc', borderRadius: '8px',
                padding: '12px 16px', marginBottom: '10px',
                border: `1px solid ${note.risk_level !== 'none' ? '#fecaca' : '#e5e7eb'}`,
                borderLeft: `3px solid ${rc2.color}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: rc2.color, backgroundColor: rc2.bg, padding: '2px 8px', borderRadius: '4px' }}>
                      {rc2.icon} {rc2.label}
                    </span>
                    {note.follow_up_needed && (
                      <span style={{ fontSize: '11px', color: '#1d4ed8', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                        📌 Follow-up
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {new Date(note.visit_date).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#374151', margin: '4px 0', lineHeight: '1.5' }}>
                  {note.visit_summary || 'No summary.'}
                </p>
                {risks.length > 0 && (
                  <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                    ⚠️ {risks.join(' · ')}
                  </div>
                )}
              </div>
            )
          })
        )}

        <VisitNoteForm patientId={id} onSubmitted={fetchData} />
      </div>

      {/* Medications */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f' }}>💊 Medications</h2>
          <button onClick={() => setShowMedForm(!showMedForm)} style={btnP}>+ Add</button>
        </div>

        {showMedForm && (
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'name', label: 'Medication Name', placeholder: 'e.g. Metformin' },
                { key: 'dosage', label: 'Dosage', placeholder: 'e.g. 500mg' },
                { key: 'times', label: 'Times UTC (comma separated)', placeholder: 'e.g. 09:00, 21:00' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>{field.label}</label>
                  <input type="text" placeholder={field.placeholder} value={medForm[field.key]} onChange={e => setMedForm({ ...medForm, [field.key]: e.target.value })} style={input} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>Frequency</label>
                <select value={medForm.frequency} onChange={e => setMedForm({ ...medForm, frequency: e.target.value })} style={input}>
                  <option value="daily">Daily</option>
                  <option value="twice_daily">Twice Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleAddMedication} style={{ ...btnP, padding: '8px 20px' }}>Save</button>
              <button onClick={() => setShowMedForm(false)} style={btnS}>Cancel</button>
            </div>
          </div>
        )}

        {medications.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>No medications added yet.</p>
        ) : (
          medications.map(med => (
            <div key={med.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
              <div>
                <span style={{ fontWeight: 'bold', color: '#1e3a5f' }}>{med.name}</span>
                <span style={{ color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>{med.dosage} · {med.frequency} · {med.times?.join(', ')} UTC</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ backgroundColor: med.active ? '#d1fae5' : '#fee2e2', color: med.active ? '#10b981' : '#ef4444', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  {med.active ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => handleDeleteMedication(med.id)} style={btnD}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Family Contacts */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f' }}>👨‍👩‍👧 Family Contacts</h2>
          <button onClick={() => setShowFamilyForm(!showFamilyForm)} style={btnP}>+ Add</button>
        </div>

        {showFamilyForm && (
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'name', label: 'Name', placeholder: 'e.g. Sarah Thomas' },
                { key: 'phone', label: 'Phone', placeholder: '+919876543210' },
                { key: 'relation', label: 'Relation', placeholder: 'e.g. daughter' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>{field.label}</label>
                  <input type="text" placeholder={field.placeholder} value={familyForm[field.key]} onChange={e => setFamilyForm({ ...familyForm, [field.key]: e.target.value })} style={input} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleAddFamily} style={{ ...btnP, padding: '8px 20px' }}>Save</button>
              <button onClick={() => setShowFamilyForm(false)} style={btnS}>Cancel</button>
            </div>
          </div>
        )}

        {familyContacts.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>No family contacts added yet.</p>
        ) : (
          familyContacts.map(contact => {
            const fl = familyLinks[contact.id]
            return (
              <div key={contact.id} style={{ backgroundColor: '#f8fafc', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#1e3a5f' }}>{contact.name}</span>
                    <span style={{ color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>{contact.relation} · {contact.phone}</span>
                    <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: '500', padding: '2px 8px', borderRadius: '12px', backgroundColor: contact.telegram_chat_id ? '#d1fae5' : '#fef3c7', color: contact.telegram_chat_id ? '#065f46' : '#92400e' }}>
                      {contact.telegram_chat_id ? '🟢 Linked' : '⚠️ Not linked'}
                    </span>
                  </div>
                  <button onClick={() => handleDeleteFamily(contact.id)} style={btnD}>Remove</button>
                </div>
                {fl && !fl.linked && (
                  <div style={{ borderTop: '1px solid #fde68a', backgroundColor: '#fffbeb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#92400e', flexShrink: 0 }}>📲 Share link:</span>
                    <span style={{ flex: 1, fontSize: '12px', color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>{fl.link}</span>
                    <button onClick={() => handleCopyFamilyLink(contact.id)} style={{ backgroundColor: copiedContact === contact.id ? '#10b981' : '#1a56db', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {copiedContact === contact.id ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}