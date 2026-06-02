import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPatient, getOnboardingLink, updatePatient } from '../api/patients'
import { getPatientMedications, createMedication, deleteMedication, getPatientLogs } from '../api/medications'
import { getFamilyContacts, createFamilyContact, deleteFamilyContact, getFamilyOnboardingLink } from '../api/family'
import { getLatestWellnessScore } from '../api/wellness'
import { getPatientRiskStatus, triggerAssessment } from '../api/emergency'
import { submitVisitNote, getPatientNotes } from '../api/copilot'
import { getPatientAlerts, acknowledgeAlert, resolveAlert } from '../api/alerts'
import * as Icons from '../components/Icons'

const statusColors = { confirmed: 'var(--success-color)', missed: 'var(--error-color)', flagged: 'var(--warning-color)', pending: 'var(--neutral-muted)' }

const riskLevelConfig = {
  none:     { color: 'var(--success-color)', bg: 'var(--success-bg)', label: 'No Risk',  icon: <Icons.Activity size={14} /> },
  low:      { color: 'var(--warning-color)', bg: 'var(--warning-bg)', label: 'Low Risk', icon: <Icons.AlertTriangle size={14} /> },
  medium:   { color: 'var(--warning-color)', bg: 'var(--warning-bg)', label: 'Medium',   icon: <Icons.AlertTriangle size={14} /> },
  high:     { color: 'var(--error-color)', bg: 'var(--error-bg)', label: 'High',     icon: <Icons.AlertTriangle size={14} /> },
  critical: { color: 'var(--error-color)', bg: 'var(--error-bg)', label: 'Critical', icon: <Icons.AlertTriangle size={14} /> },
}

const statusIcon = {
  confirmed: <Icons.Activity size={13} style={{ color: 'var(--success-color)' }} />,
  missed: <Icons.AlertTriangle size={13} style={{ color: 'var(--error-color)' }} />,
  flagged: <Icons.AlertTriangle size={13} style={{ color: 'var(--warning-color)' }} />,
  pending: <Icons.Calendar size={13} style={{ color: 'var(--neutral-muted)' }} />
}

const scoreColor = (score) => {
  if (!score) return { color: 'var(--neutral-muted)', label: '—' }
  if (score >= 8) return { color: 'var(--success-color)', label: `${score}/10 — Good` }
  if (score >= 6) return { color: 'var(--warning-color)', label: `${score}/10 — Fair` }
  if (score >= 4) return { color: 'var(--warning-color)', label: `${score}/10 — Low` }
  return { color: 'var(--error-color)', label: `${score}/10 — Critical` }
}

function WellnessCard({ wellness }) {
  const [showDetails, setShowDetails] = useState(false)

  if (!wellness) {
    return (
      <div style={{
        backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)',
        padding: '14px 16px', border: '1px solid var(--neutral-border)',
        textAlign: 'center', color: 'var(--neutral-muted)', fontSize: '13px'
      }}>
        No wellness check-in data yet.
      </div>
    )
  }

  if (wellness.score === null || wellness.score === undefined) {
    if (wellness.concerns && (wellness.concerns.includes("Error") || wellness.concerns.includes("failed"))) {
      let friendlyMsg = "The AI Wellness service is temporarily unavailable. Please try again shortly."
      if (wellness.concerns.includes("429") || wellness.concerns.includes("quota")) {
        friendlyMsg = "AI service quota exceeded. Daily wellness scores are temporarily suspended. Please contact support or try again later."
      } else if (wellness.concerns.includes("503") || wellness.concerns.includes("busy") || wellness.concerns.includes("demand")) {
        friendlyMsg = "The AI Wellness service is temporarily overloaded. Scores will automatically recalculate shortly."
      }

      return (
        <div style={{
          backgroundColor: 'var(--error-bg)', borderRadius: 'var(--radius-md)',
          padding: '14px 16px', border: '1px solid var(--error-border)',
          color: 'var(--error-color)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', fontSize: '14px' }}>
            <Icons.AlertTriangle size={14} style={{ color: 'var(--error-color)' }} />
            Wellness Analysis Offline
          </div>
          <span style={{ fontSize: '12px', opacity: 0.95, lineHeight: '1.4' }}>{friendlyMsg}</span>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              color: 'var(--error-color)',
              textDecoration: 'underline',
              fontSize: '11px',
              padding: 0,
              cursor: 'pointer',
              fontWeight: '600',
              opacity: 0.8
            }}
          >
            {showDetails ? 'Hide Technical Details' : 'Show Technical Details'}
          </button>
          {showDetails && (
            <pre style={{
              margin: '4px 0 0 0',
              padding: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '10px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: '120px',
              overflowY: 'auto',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              color: 'var(--error-color)',
              lineHeight: '1.3'
            }}>
              {wellness.concerns}
            </pre>
          )}
        </div>
      )
    }
    return (
      <div style={{
        backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)',
        padding: '14px 16px', border: '1px solid var(--neutral-border)',
        textAlign: 'center', color: 'var(--neutral-muted)', fontSize: '13px'
      }}>
        No wellness check-in data yet.
      </div>
    )
  }
  const sc = scoreColor(wellness.score)
  return (
    <div style={{ backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--neutral-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '22px', fontWeight: '800', color: sc.color }}>{sc.label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[
          ['Mood', wellness.mood],
          ['Pain', wellness.pain],
          ['Eating', wellness.eating],
          ['Sleep', wellness.sleep],
        ].map(([label, value]) => (
          <div key={label} style={{ backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', border: '1px solid var(--neutral-border)' }}>
            <div style={{ fontSize: '9px', color: 'var(--neutral-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontSize: '13px', color: 'var(--neutral-dark)', fontWeight: '600' }}>{value || '—'}</div>
          </div>
        ))}
      </div>
      {wellness.concerns && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--warning-color)', backgroundColor: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', borderLeft: '3px solid var(--warning-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.AlertTriangle size={12} style={{ flexShrink: 0 }} /> {wellness.concerns}
        </div>
      )}
      {wellness.checked_at && (
        <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', marginTop: '6px' }}>
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

  const riskColors = { none: 'var(--success-color)', low: 'var(--warning-color)', medium: 'var(--warning-color)', high: 'var(--error-color)' }

  return (
    <div style={{ marginTop: '20px' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-premium"
          style={{
            width: '100%', padding: '12px', backgroundColor: 'var(--primary-color)',
            color: '#ffffff', borderRadius: 'var(--radius-md)',
            fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}
        >
          <Icons.FileText size={16} /> Write Visit Note
        </button>
      ) : (
        <div style={{ backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--neutral-border)' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--neutral-dark)', marginBottom: '8px' }}>
            New Visit Note
          </div>
          <p style={{ fontSize: '12px', color: 'var(--neutral-muted)', marginBottom: '10px', margin: '0 0 10px' }}>
            Describe the visit naturally — vitals, observations, medications given, any concerns. The AI will structure it automatically.
          </p>
          <textarea
            placeholder="e.g. Visited Mrs. Ahmed at 2pm. BP was 138/88, pulse 72. She took her Metformin and Lisinopril. Seemed a bit more tired than usual, mentioned lower back pain (mild). Had eaten lunch. Flat is tidy and warm. Follow up on back pain next visit."
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '13px',
              border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--card-bg)', color: 'var(--neutral-text)',
              resize: 'vertical', minHeight: '100px', boxSizing: 'border-box',
              fontFamily: 'inherit', lineHeight: '1.5', outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || !note.trim()}
              className="btn-premium btn-success"
              style={{
                padding: '8px 20px', cursor: submitting || !note.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: '700'
              }}
            >
              {submitting ? 'Processing...' : 'Submit & Analyse'}
            </button>
            <button
              onClick={() => { setOpen(false); setNote(''); setResult(null) }}
              className="btn-primary-outline"
              style={{
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              Cancel
            </button>
          </div>

          {result && (
            <div style={{ marginTop: '14px', padding: '12px 14px', backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-md)', border: `1px solid ${result.risk_level !== 'none' ? 'var(--error-color)' : 'var(--success-color)'}` }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: riskColors[result.risk_level] || 'var(--neutral-dark)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icons.Activity size={14} /> Processed — Risk: {result.risk_level?.toUpperCase() || 'NONE'}
              </div>
              {result.visit_summary && (
                <p style={{ fontSize: '12px', color: 'var(--neutral-text)', margin: '0 0 6px', lineHeight: '1.5' }}>
                  {result.visit_summary}
                </p>
              )}
              {result.risk_flags?.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--error-color)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icons.AlertTriangle size={12} style={{ flexShrink: 0 }} /> Flags: {result.risk_flags.join(', ')}
                </div>
              )}
              {result.follow_up_needed && result.follow_up_note && (
                <div style={{ fontSize: '12px', color: 'var(--info-color)', marginTop: '4px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icons.Calendar size={12} style={{ flexShrink: 0 }} /> {result.follow_up_note}
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
  const [alerts, setAlerts]       = useState([])
  const [activeTab, setActiveTab] = useState('health')
  const [showEditForm, setShowEditForm] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', phone: '', age: '', language: 'en', clinical_conditions: '', baseline_bp: '', timezone: 'Asia/Kolkata'
  })
  const [loading, setLoading]     = useState(true)
  const [copied, setCopied]       = useState(false)
  const [familyLinks, setFamilyLinks] = useState({})
  const [copiedContact, setCopiedContact] = useState(null)
  const [showMedForm, setShowMedForm]   = useState(false)
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [medForm, setMedForm]   = useState({ name: '', dosage: '', frequency: 'daily', times: ['09:00'] })
  const [familyForm, setFamilyForm] = useState({ name: '', phone: '', relation: '' })
  const [scanningRisk, setScanningRisk] = useState(false)

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

      const [wellRes, riskRes, notesRes, alertsRes, fLinks] = await Promise.all([
        getLatestWellnessScore(id).catch(() => ({ data: null })),
        getPatientRiskStatus(id).catch(() => ({ data: null })),
        getPatientNotes(id).catch(() => ({ data: [] })),
        getPatientAlerts(id).catch(() => ({ data: [] })),
        Promise.all(familyRes.data.map(c =>
          getFamilyOnboardingLink(c.id).then(r => [c.id, r.data]).catch(() => null)
        )),
      ])
      setWellness(wellRes.data)
      setRiskStatus(riskRes.data)
      setRecentNotes((notesRes.data || []).slice(0, 5))
      setAlerts(alertsRes.data || [])
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

  const handleEmergencyScan = async () => {
    setScanningRisk(true)
    try {
      await triggerAssessment(id)
      const [riskRes, alertsRes] = await Promise.all([
        getPatientRiskStatus(id).catch(() => ({ data: null })),
        getPatientAlerts(id).catch(() => ({ data: [] })),
      ])
      setRiskStatus(riskRes.data)
      setAlerts(alertsRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setScanningRisk(false)
    }
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
        times: medForm.times.filter(t => t.trim() !== ''),
        active: true
      })
      setShowMedForm(false)
      setMedForm({ name: '', dosage: '', frequency: 'daily', times: ['09:00'] })
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

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await acknowledgeAlert(alertId)
      fetchData()
    } catch { alert('Error acknowledging alert') }
  }

  const handleResolveAlert = async (alertId) => {
    try {
      await resolveAlert(alertId)
      fetchData()
    } catch { alert('Error resolving alert') }
  }

  const handleUpdatePatient = async () => {
    try {
      if (!editForm.name.trim() || !editForm.phone.trim()) {
        alert('Name and Phone are required')
        return
      }
      await updatePatient(id, {
        ...editForm,
        age: editForm.age ? parseInt(editForm.age) : null,
      })
      setShowEditForm(false)
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Error updating patient profile')
    }
  }

  if (loading) return <div className="card-premium" style={{ margin: '40px', textAlign: 'center', color: 'var(--neutral-muted)' }}>Loading...</div>
  if (!patient) return <div className="card-premium" style={{ margin: '40px', textAlign: 'center', color: 'var(--neutral-muted)' }}>Patient not found</div>

  const rc = riskLevelConfig[riskStatus?.risk_level || 'none']
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--neutral-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    backgroundColor: 'var(--card-bg)',
    color: 'var(--neutral-text)',
    boxSizing: 'border-box',
    outline: 'none'
  }

  return (
    <div className="page-container">
      {/* Executive Breadcrumb Navigation */}
      <button
        onClick={() => navigate('/patients')}
        style={{
          backgroundColor: 'transparent', border: 'none',
          color: 'var(--primary-color)', cursor: 'pointer',
          fontSize: '14px', marginBottom: '20px', padding: 0,
          fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px'
        }}
      >
        <Icons.Activity size={14} style={{ transform: 'rotate(90deg)' }} /> ← Back to Patients List
      </button>

      {/* Patient Header Card */}
      <div className="card-premium" style={{ marginBottom: '20px' }}>
        {showEditForm ? (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '16px' }}>Edit Patient Profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Full Name *</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Phone *</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Age</label>
                <input type="number" value={editForm.age} onChange={e => setEditForm({ ...editForm, age: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Language</label>
                <select value={editForm.language} onChange={e => setEditForm({ ...editForm, language: e.target.value })} style={inputStyle}>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="ml">Malayalam</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Baseline BP (e.g. 120/80)</label>
                <input type="text" value={editForm.baseline_bp} onChange={e => setEditForm({ ...editForm, baseline_bp: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Timezone</label>
                <input type="text" value={editForm.timezone} onChange={e => setEditForm({ ...editForm, timezone: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '12px', color: 'var(--neutral-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Clinical Conditions</label>
                <textarea 
                  value={editForm.clinical_conditions} 
                  onChange={e => setEditForm({ ...editForm, clinical_conditions: e.target.value })} 
                  style={{ ...inputStyle, minHeight: '60px', fontFamily: 'inherit', resize: 'vertical' }} 
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleUpdatePatient} 
                className="btn-premium btn-success" 
                style={{ padding: '8px 20px', fontWeight: '700', cursor: 'pointer' }}
              >
                Save Changes
              </button>
              <button 
                onClick={() => setShowEditForm(false)} 
                className="btn-primary-outline" 
                style={{ borderRadius: 'var(--radius-md)', padding: '8px 14px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                <Icons.User size={24} style={{ color: 'var(--neutral-muted)' }} /> 
                {patient.name}
              </h1>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--neutral-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icons.Phone size={13} /> {patient.phone}</span>
                <span style={{ fontSize: '13px', color: 'var(--neutral-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icons.Calendar size={13} /> Age: {patient.age || 'N/A'}</span>
                <span style={{ fontSize: '13px', color: 'var(--neutral-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icons.Globe size={13} /> {patient.language?.toUpperCase()}</span>
              </div>
            </div>
            
            <button
              onClick={() => {
                setEditForm({
                  name: patient.name,
                  phone: patient.phone,
                  age: patient.age || '',
                  language: patient.language || 'en',
                  clinical_conditions: patient.clinical_conditions || '',
                  baseline_bp: patient.baseline_bp || '',
                  timezone: patient.timezone || 'Asia/Kolkata'
                });
                setShowEditForm(true);
              }}
              className="btn-primary-outline"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: '700',
              }}
            >
              ✏️ Edit Profile
            </button>
          </div>
        )}
      </div>

      {/* 🚀 Hero Summary Bar (3 Executive Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Card 1: Wellness Status */}
        {(() => {
          const sc = scoreColor(wellness?.score);
          const hasError = wellness?.concerns && (wellness.concerns.includes("Error") || wellness.concerns.includes("failed"));
          return (
            <div className="card-premium" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px', 
              padding: '16px 20px', 
              marginBottom: 0,
              borderLeft: `4px solid ${hasError ? 'var(--error-color)' : sc.color}`
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: hasError ? 'var(--error-bg)' : 'var(--neutral-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: hasError ? 'var(--error-color)' : sc.color
              }}>
                <Icons.Heart size={20} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Wellness Score</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--neutral-dark)' }}>
                  {hasError ? (
                    <span style={{ fontSize: '14px', color: 'var(--error-color)' }}>Offline</span>
                  ) : (
                    sc.label
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Card 2: Clinical Risk Level */}
        <div className="card-premium" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: '16px', 
          padding: '16px 20px', 
          marginBottom: 0,
          borderLeft: `4px solid ${rc.color}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: rc.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: rc.color
            }}>
              <Icons.AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Clinical Risk</div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--neutral-dark)' }}>
                {rc.label}
              </div>
            </div>
          </div>
          <button
            onClick={handleEmergencyScan}
            disabled={scanningRisk}
            className="btn-premium btn-primary-outline"
            style={{ padding: '6px 12px', fontSize: '12px', flexShrink: 0 }}
          >
            {scanningRisk ? 'Scanning...' : 'Scan Risk'}
          </button>
        </div>

        {/* Card 3: Today's Medication Adherence */}
        {(() => {
          const totalMeds = logs.length;
          const confirmedMeds = logs.filter(l => l.status === 'confirmed').length;
          const adherencePercent = totalMeds > 0 ? Math.round((confirmedMeds / totalMeds) * 100) : null;
          return (
            <div className="card-premium" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px', 
              padding: '16px 20px', 
              marginBottom: 0,
              borderLeft: '4px solid var(--primary-color)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--neutral-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-color)'
              }}>
                <Icons.Pill size={20} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Today's Adherence</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--neutral-dark)' }}>
                  {adherencePercent !== null ? `${adherencePercent}%` : 'No logs today'}
                </div>
              </div>
            </div>
          );
        })()}

      </div>

      {/* 🚀 Interactive Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        borderBottom: '1px solid var(--neutral-border)', 
        marginBottom: '24px', 
        paddingBottom: '2px' 
      }}>
        {[
          { id: 'health', label: '🩺 Health & Vitals' },
          { id: 'visits', label: '📋 Visit Logs & Notes' },
          { id: 'profile', label: '⚙️ Profile & Management' }
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '3px solid var(--primary-color)' : '3px solid transparent',
                color: active ? 'var(--primary-color)' : 'var(--neutral-muted)',
                fontWeight: active ? '800' : '600',
                padding: '10px 16px',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                marginBottom: '-3px'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 🚀 Tab 1: Health & Vitals Workspace */}
      {activeTab === 'health' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Wellness Assessment Grid Card */}
            <div className="card-premium" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px 0' }}>
                <Icons.Heart size={16} /> Wellness Check-in Assessment
              </h2>
              <WellnessCard wellness={wellness} />
            </div>

            {/* Today's Activity Medication Logs list */}
            <div className="card-premium" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px 0' }}>
                <Icons.Activity size={16} /> Today's Medication Logs
              </h2>
              {logs.length === 0 ? (
                <p style={{ color: 'var(--neutral-muted)', fontSize: '13px', margin: 0 }}>No logs generated yet today.</p>
              ) : (
                logs.map(log => (
                  <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--neutral-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      {statusIcon[log.status]}
                      <span style={{ fontWeight: '700', color: statusColors[log.status], fontSize: '11px', flexShrink: 0 }}>
                        {log.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--neutral-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.patient_reply ? `"${log.patient_reply}"` : 'No reply'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', flexShrink: 0, marginLeft: '8px' }}>
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Alerts List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card-premium" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icons.Bell size={16} /> Active Alerts & Flags
                </h2>
                {alerts.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--neutral-muted)', fontWeight: '600' }}>
                    {alerts.filter(a => a.status !== 'resolved').length} open
                  </span>
                )}
              </div>
              
              {alerts.filter(a => a.status !== 'resolved').length === 0 ? (
                <p style={{ color: 'var(--neutral-muted)', fontSize: '13px', margin: 0 }}>No active alerts or flags.</p>
              ) : (
                <div style={{ display: 'grid', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                  {alerts.filter(a => a.status !== 'resolved').map(alert => {
                    const statusColors = {
                      open: 'var(--error-color)',
                      acknowledged: 'var(--warning-color)',
                      resolved: 'var(--success-color)'
                    }
                    const statusBgs = {
                      open: 'var(--error-bg)',
                      acknowledged: 'var(--warning-bg)',
                      resolved: 'var(--success-bg)'
                    }
                    return (
                      <div key={alert.id} style={{
                        backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-sm)',
                        padding: '10px 12px', border: '1px solid var(--neutral-border)',
                        display: 'flex', flexDirection: 'column', gap: '6px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="badge-premium" style={{
                            backgroundColor: statusBgs[alert.status],
                            color: statusColors[alert.status],
                            borderColor: statusColors[alert.status],
                            fontSize: '9px',
                            textTransform: 'uppercase',
                            fontWeight: '700',
                            padding: '1px 6px'
                          }}>
                            {alert.status}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--neutral-muted)' }}>
                            {new Date(alert.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--neutral-dark)', margin: 0, fontWeight: '600', lineHeight: '1.4' }}>
                          {alert.message}
                        </p>
                        
                        {alert.status !== 'resolved' && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            {alert.status === 'open' && (
                              <button
                                onClick={() => handleAcknowledgeAlert(alert.id)}
                                className="btn-premium"
                                style={{ padding: '3px 8px', fontSize: '10px', backgroundColor: 'var(--warning-color)', color: '#ffffff', cursor: 'pointer', flex: 1 }}
                              >
                                Ack
                              </button>
                            )}
                            <button
                              onClick={() => handleResolveAlert(alert.id)}
                              className="btn-premium btn-success"
                              style={{ padding: '3px 8px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', flex: 1 }}
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* 🚀 Tab 2: Visit Logs & Notes Workspace */}
      {activeTab === 'visits' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '24px', alignItems: 'flex-start' }}>
          {/* Timeline Feed of Visit Notes */}
          <div className="card-premium" style={{ marginBottom: 0 }}>
            <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px 0' }}>
              <Icons.FileText size={16} /> Coordinator Care Logs Feed
            </h2>

            {recentNotes.length === 0 ? (
              <p style={{ color: 'var(--neutral-muted)', fontSize: '13px', margin: 0 }}>No visit notes recorded yet.</p>
            ) : (
              recentNotes.map(note => {
                const rc2 = riskLevelConfig[note.risk_level] || riskLevelConfig.none
                let risks = []
                try { risks = JSON.parse(note.risk_flags || '[]') } catch {}
                return (
                  <div key={note.id} style={{
                    backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)',
                    padding: '14px 16px', marginBottom: '12px',
                    border: `1px solid ${note.risk_level !== 'none' ? rc2.color : 'var(--neutral-border)'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`badge-premium ${note.risk_level === 'high' || note.risk_level === 'critical' ? 'badge-danger' : note.risk_level === 'none' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                          {rc2.icon} {rc2.label}
                        </span>
                        {note.follow_up_needed && (
                          <span className="badge-premium badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', padding: '2px 8px' }}>
                            <Icons.Calendar size={11} /> Follow-up Required
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--neutral-muted)' }}>
                        {new Date(note.visit_date).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--neutral-text)', margin: '6px 0', lineHeight: '1.5' }}>
                      {note.visit_summary || 'No summary.'}
                    </p>
                    {risks.length > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--error-color)', marginTop: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icons.AlertTriangle size={12} style={{ flexShrink: 0 }} /> Risks: {risks.join(' · ')}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Form to submit visit note */}
          <div className="card-premium" style={{ marginBottom: 0 }}>
            <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px 0' }}>
              <Icons.FileText size={16} /> Add Coordinator Entry
            </h2>
            <VisitNoteForm patientId={id} onSubmitted={fetchData} />
          </div>
        </div>
      )}

      {/* 🚀 Tab 3: Profile & Management Workspace */}
      {activeTab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Clinical Baseline Context Displays */}
            <div className="card-premium" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px 0' }}>
                <Icons.Activity size={16} /> Clinical Baseline Context
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--neutral-border)' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--neutral-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '2px' }}>Baseline BP</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--neutral-dark)' }}>{patient.baseline_bp || 'Not set'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--neutral-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '2px' }}>Local Timezone</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--neutral-dark)' }}>{patient.timezone || 'Asia/Kolkata'}</div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '10px', color: 'var(--neutral-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '2px' }}>Clinical Conditions</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--neutral-dark)', lineHeight: '1.4' }}>{patient.clinical_conditions || 'None registered'}</div>
                </div>
              </div>
            </div>

            {/* Active prescription schedule scheduler */}
            <div className="card-premium" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icons.Pill size={16} /> Active Prescription Scheduler
                </h2>
                <button
                  onClick={() => {
                    setShowMedForm(!showMedForm);
                    setMedForm({ name: '', dosage: '', frequency: 'daily', times: ['09:00'] });
                  }}
                  className="btn-premium"
                  style={{ backgroundColor: 'var(--primary-color)', color: '#ffffff', padding: '4px 12px', fontSize: '12px' }}
                >
                  {showMedForm ? 'Cancel' : '+ Add Medication'}
                </button>
              </div>

              {showMedForm && (
                <div style={{ backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px', border: '1px solid var(--neutral-border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {[
                      { key: 'name', label: 'Medication Name', placeholder: 'e.g. Metformin' },
                      { key: 'dosage', label: 'Dosage', placeholder: 'e.g. 500mg' },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={{ fontSize: '12px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>{field.label}</label>
                        <input type="text" placeholder={field.placeholder} value={medForm[field.key]} onChange={e => setMedForm({ ...medForm, [field.key]: e.target.value })} style={inputStyle} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Frequency</label>
                      <select value={medForm.frequency} onChange={e => setMedForm({ ...medForm, frequency: e.target.value })} style={inputStyle}>
                        <option value="daily">Daily</option>
                        <option value="twice_daily">Twice Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--neutral-text)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                      Scheduled Times ({patient?.timezone || 'Asia/Kolkata'})
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {medForm.times.map((time, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px' }}>
                          <input 
                            type="time" 
                            value={time} 
                            onChange={e => {
                              const newTimes = [...medForm.times];
                              newTimes[idx] = e.target.value;
                              setMedForm({ ...medForm, times: newTimes });
                            }} 
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--neutral-dark)',
                              fontSize: '12px',
                              outline: 'none',
                              fontFamily: 'inherit',
                              cursor: 'pointer'
                            }} 
                          />
                          {medForm.times.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => {
                                const newTimes = medForm.times.filter((_, i) => i !== idx);
                                setMedForm({ ...medForm, times: newTimes });
                              }} 
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--error-color)',
                                cursor: 'pointer',
                                padding: '0 2px',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button 
                        type="button" 
                        onClick={() => setMedForm({ ...medForm, times: [...medForm.times, '09:00'] })} 
                        className="btn-primary-outline" 
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          height: '28px',
                          cursor: 'pointer'
                        }}
                      >
                        + Add Time
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleAddMedication} className="btn-premium btn-success" style={{ padding: '6px 16px', fontSize: '13px', fontWeight: '700' }}>Save</button>
                    <button onClick={() => setShowMedForm(false)} className="btn-primary-outline" style={{ borderRadius: 'var(--radius-md)', padding: '6px 12px', fontSize: '13px' }}>Cancel</button>
                  </div>
                </div>
              )}

              {medications.length === 0 ? (
                <p style={{ color: 'var(--neutral-muted)', fontSize: '13px', margin: 0 }}>No medications added yet.</p>
              ) : (
                medications.map(med => (
                  <div key={med.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--neutral-border)' }}>
                    <div>
                      <span style={{ fontWeight: '700', color: 'var(--neutral-dark)', fontSize: '13px' }}>{med.name}</span>
                      <span style={{ color: 'var(--neutral-muted)', fontSize: '12px', marginLeft: '8px' }}>{med.dosage} · {med.frequency} · {med.times?.join(', ')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`badge-premium ${med.active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                        {med.active ? 'Active' : 'Inactive'}
                      </span>
                      <button onClick={() => handleDeleteMedication(med.id)} className="btn-premium btn-danger" style={{ padding: '3px 8px', fontSize: '11px' }}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Onboarding connect Telegram connection */}
            {onboarding && !onboarding.linked && (
              <div className="card-premium" style={{ border: '1px solid var(--warning-color)', backgroundColor: 'var(--warning-bg)', padding: '16px', marginBottom: 0 }}>
                <h2 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--warning-color)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 4px 0' }}>
                  <Icons.Phone size={14} /> Connect Telegram
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--neutral-muted)', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                  Share this onboarding link with the patient to connect their Telegram.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', border: '1px solid var(--neutral-border)' }}>
                  <span style={{ flex: 1, fontSize: '11px', color: 'var(--neutral-text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {onboarding.link}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="btn-premium"
                    style={{
                      backgroundColor: copied ? 'var(--success-color)' : 'var(--primary-color)',
                      color: '#ffffff', whiteSpace: 'nowrap', flexShrink: 0, padding: '4px 10px', fontSize: '11px'
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {onboarding?.linked && (
              <div className="card-premium" style={{ border: '1px solid var(--success-color)', backgroundColor: 'var(--success-bg)', padding: '12px 16px', marginBottom: 0 }}>
                <p style={{ fontSize: '12px', color: 'var(--success-color)', margin: 0, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icons.Activity size={14} /> <b>Telegram connected.</b> Automated reminders are active.
                </p>
              </div>
            )}

            {/* Family Contacts Card */}
            <div className="card-premium" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--neutral-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icons.Users size={16} /> Family Contacts
                </h2>
                <button
                  onClick={() => setShowFamilyForm(!showFamilyForm)}
                  className="btn-premium"
                  style={{ backgroundColor: 'var(--primary-color)', color: '#ffffff', padding: '4px 12px', fontSize: '12px' }}
                >
                  {showFamilyForm ? 'Cancel' : '+ Add Contact'}
                </button>
              </div>

              {showFamilyForm && (
                <div style={{ backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '12px', border: '1px solid var(--neutral-border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '12px' }}>
                    {[
                      { key: 'name', label: 'Name', placeholder: 'Sarah Thomas' },
                      { key: 'phone', label: 'Phone', placeholder: '+919876543210' },
                      { key: 'relation', label: 'Relation', placeholder: 'e.g. daughter' },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={{ fontSize: '11px', color: 'var(--neutral-text)', display: 'block', marginBottom: '2px', fontWeight: '600' }}>{field.label}</label>
                        <input type="text" placeholder={field.placeholder} value={familyForm[field.key]} onChange={e => setFamilyForm({ ...familyForm, [field.key]: e.target.value })} style={inputStyle} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleAddFamily} className="btn-premium btn-success" style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700' }}>Save</button>
                    <button onClick={() => setShowFamilyForm(false)} className="btn-primary-outline" style={{ borderRadius: 'var(--radius-md)', padding: '5px 10px', fontSize: '12px' }}>Cancel</button>
                  </div>
                </div>
              )}

              {familyContacts.length === 0 ? (
                <p style={{ color: 'var(--neutral-muted)', fontSize: '13px', margin: 0 }}>No family contacts.</p>
              ) : (
                familyContacts.map(contact => {
                  const fl = familyLinks[contact.id]
                  return (
                    <div key={contact.id} style={{ backgroundColor: 'var(--neutral-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--neutral-border)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: '700', color: 'var(--neutral-dark)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</div>
                          <div style={{ color: 'var(--neutral-muted)', fontSize: '11px', marginTop: '2px' }}>{contact.relation} · {contact.phone}</div>
                        </div>
                        <button onClick={() => handleDeleteFamily(contact.id)} className="btn-premium btn-danger" style={{ padding: '3px 8px', fontSize: '10px', flexShrink: 0, marginLeft: '6px' }}>Remove</button>
                      </div>
                      {fl && !fl.linked && (
                        <div style={{ borderTop: '1px solid var(--neutral-border)', backgroundColor: 'var(--warning-bg)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: 'var(--neutral-text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{fl.link}</span>
                          <button
                            onClick={() => handleCopyFamilyLink(contact.id)}
                            className="btn-premium"
                            style={{
                              backgroundColor: copiedContact === contact.id ? 'var(--success-color)' : 'var(--primary-color)',
                              color: '#ffffff', whiteSpace: 'nowrap', flexShrink: 0, padding: '3px 8px', fontSize: '10px', marginLeft: '6px'
                            }}
                          >
                            {copiedContact === contact.id ? '✓' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  )
}