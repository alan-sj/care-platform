import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPatient } from '../api/patients'
import { getPatientMedications, createMedication, deleteMedication, getPatientLogs } from '../api/medications'
import { getFamilyContacts, createFamilyContact, deleteFamilyContact } from '../api/family'

const statusColors = {
  confirmed: '#10b981',
  missed: '#ef4444',
  flagged: '#f97316',
  pending: '#6b7280'
}

const statusEmoji = {
  confirmed: '✅',
  missed: '❌',
  flagged: '🟠',
  pending: '⏳'
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [medications, setMedications] = useState([])
  const [logs, setLogs] = useState([])
  const [familyContacts, setFamilyContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showMedForm, setShowMedForm] = useState(false)
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [medForm, setMedForm] = useState({
    name: '', dosage: '', frequency: 'daily', times: ''
  })
  const [familyForm, setFamilyForm] = useState({
    name: '', phone: '', relation: '', telegram_chat_id: ''
  })

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const [patientRes, medsRes, logsRes, familyRes] = await Promise.all([
        getPatient(id),
        getPatientMedications(id),
        getPatientLogs(id),
        getFamilyContacts(id)
      ])
      setPatient(patientRes.data)
      setMedications(medsRes.data)
      setLogs(logsRes.data)
      setFamilyContacts(familyRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddMedication = async () => {
    try {
      await createMedication({
        patient_id: id,
        name: medForm.name,
        dosage: medForm.dosage,
        frequency: medForm.frequency,
        times: medForm.times.split(',').map(t => t.trim()),
        active: true
      })
      setShowMedForm(false)
      setMedForm({ name: '', dosage: '', frequency: 'daily', times: '' })
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Error adding medication')
    }
  }

  const handleDeleteMedication = async (medId) => {
    if (!confirm('Delete this medication?')) return
    await deleteMedication(medId)
    fetchData()
  }

  const handleAddFamily = async () => {
    try {
      await createFamilyContact({
        patient_id: id,
        name: familyForm.name,
        phone: familyForm.phone,
        relation: familyForm.relation,
        telegram_chat_id: familyForm.telegram_chat_id ? parseInt(familyForm.telegram_chat_id) : null
      })
      setShowFamilyForm(false)
      setFamilyForm({ name: '', phone: '', relation: '', telegram_chat_id: '' })
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Error adding family contact')
    }
  }

  const handleDeleteFamily = async (contactId) => {
    if (!confirm('Remove this family contact?')) return
    await deleteFamilyContact(contactId)
    fetchData()
  }

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
  )

  if (!patient) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Patient not found</div>
  )

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  }

  const btnPrimary = {
    backgroundColor: '#1a56db',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '13px'
  }

  const btnSecondary = {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 20px',
    cursor: 'pointer'
  }

  const btnDanger = {
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    border: 'none',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '12px'
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>

      {/* Back */}
      <button onClick={() => navigate('/patients')} style={{
        backgroundColor: 'transparent', border: 'none',
        color: '#1a56db', cursor: 'pointer', fontSize: '14px',
        marginBottom: '16px', padding: 0
      }}>
        ← Back to Patients
      </button>

      {/* Patient Header */}
      <div style={cardStyle}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '8px' }}>
          👤 {patient.name}
        </h1>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>📞 {patient.phone}</span>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>🎂 Age: {patient.age || 'N/A'}</span>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>🌐 {patient.language}</span>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>
            💬 Telegram: {patient.telegram_chat_id || 'Not linked'}
          </span>
        </div>
      </div>

      {/* Today's Medication Logs */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '16px' }}>
          📋 Today's Activity
        </h2>
        {logs.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>No activity logged today.</p>
        ) : (
          logs.map(log => (
            <div key={log.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: '#f8fafc',
              borderRadius: '6px',
              marginBottom: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div>
                <span style={{ fontWeight: 'bold', color: '#1e3a5f', marginRight: '8px' }}>
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

      {/* Medications */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f' }}>💊 Medications</h2>
          <button onClick={() => setShowMedForm(!showMedForm)} style={btnPrimary}>+ Add</button>
        </div>

        {showMedForm && (
          <div style={{
            backgroundColor: '#f8fafc', borderRadius: '8px',
            padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'name', label: 'Medication Name', placeholder: 'e.g. Metformin' },
                { key: 'dosage', label: 'Dosage', placeholder: 'e.g. 500mg' },
                { key: 'times', label: 'Times UTC (comma separated)', placeholder: 'e.g. 09:00, 21:00' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>
                    {field.label}
                  </label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={medForm[field.key]}
                    onChange={e => setMedForm({ ...medForm, [field.key]: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>
                  Frequency
                </label>
                <select
                  value={medForm.frequency}
                  onChange={e => setMedForm({ ...medForm, frequency: e.target.value })}
                  style={inputStyle}
                >
                  <option value="daily">Daily</option>
                  <option value="twice_daily">Twice Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleAddMedication} style={{ ...btnPrimary, padding: '8px 20px' }}>Save</button>
              <button onClick={() => setShowMedForm(false)} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {medications.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>No medications added yet.</p>
        ) : (
          medications.map(med => (
            <div key={med.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', backgroundColor: '#f8fafc',
              borderRadius: '6px', marginBottom: '8px', border: '1px solid #e5e7eb'
            }}>
              <div>
                <span style={{ fontWeight: 'bold', color: '#1e3a5f' }}>{med.name}</span>
                <span style={{ color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>
                  {med.dosage} · {med.frequency} · {med.times?.join(', ')} UTC
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  backgroundColor: med.active ? '#d1fae5' : '#fee2e2',
                  color: med.active ? '#10b981' : '#ef4444',
                  padding: '2px 8px', borderRadius: '12px', fontSize: '12px'
                }}>
                  {med.active ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => handleDeleteMedication(med.id)} style={btnDanger}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Family Contacts */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f' }}>👨‍👩‍👧 Family Contacts</h2>
          <button onClick={() => setShowFamilyForm(!showFamilyForm)} style={btnPrimary}>+ Add</button>
        </div>

        {showFamilyForm && (
          <div style={{
            backgroundColor: '#f8fafc', borderRadius: '8px',
            padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'name', label: 'Name', placeholder: 'e.g. Sarah Thomas' },
                { key: 'phone', label: 'Phone', placeholder: '+919876543210' },
                { key: 'relation', label: 'Relation', placeholder: 'e.g. daughter' },
                { key: 'telegram_chat_id', label: 'Telegram Chat ID', placeholder: 'e.g. 123456789' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>
                    {field.label}
                  </label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={familyForm[field.key]}
                    onChange={e => setFamilyForm({ ...familyForm, [field.key]: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleAddFamily} style={{ ...btnPrimary, padding: '8px 20px' }}>Save</button>
              <button onClick={() => setShowFamilyForm(false)} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {familyContacts.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>No family contacts added yet.</p>
        ) : (
          familyContacts.map(contact => (
            <div key={contact.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', backgroundColor: '#f8fafc',
              borderRadius: '6px', marginBottom: '8px', border: '1px solid #e5e7eb'
            }}>
              <div>
                <span style={{ fontWeight: 'bold', color: '#1e3a5f' }}>{contact.name}</span>
                <span style={{ color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>
                  {contact.relation} · {contact.phone}
                  {contact.telegram_chat_id && ` · Telegram: ${contact.telegram_chat_id}`}
                </span>
              </div>
              <button onClick={() => handleDeleteFamily(contact.id)} style={btnDanger}>Remove</button>
            </div>
          ))
        )}
      </div>

    </div>
  )
}