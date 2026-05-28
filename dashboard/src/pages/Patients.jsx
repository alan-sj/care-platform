import { useState, useEffect } from 'react'
import PatientCard from '../components/PatientCard'
import { getPatients, createPatient } from '../api/patients'

export default function Patients() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', age: '', language: 'en', telegram_chat_id: ''
  })

  useEffect(() => { fetchPatients() }, [])

  const fetchPatients = async () => {
    try {
      const res = await getPatients()
      setPatients(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      await createPatient({
        ...form,
        age: form.age ? parseInt(form.age) : null,
        telegram_chat_id: form.telegram_chat_id ? parseInt(form.telegram_chat_id) : null
      })
      setShowForm(false)
      setForm({ name: '', phone: '', age: '', language: 'en', telegram_chat_id: '' })
      fetchPatients()
    } catch (err) {
      console.error(err)
      alert('Error creating patient')
    }
  }

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
  )

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a5f' }}>
          Patients
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            backgroundColor: '#1a56db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          + Add Patient
        </button>
      </div>

      {/* Add Patient Form */}
      {showForm && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '16px', color: '#1e3a5f' }}>New Patient</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { key: 'name', label: 'Full Name', type: 'text', required: true },
              { key: 'phone', label: 'Phone', type: 'text', required: true },
              { key: 'age', label: 'Age', type: 'number' },
              { key: 'telegram_chat_id', label: 'Telegram Chat ID', type: 'number' },
            ].map(field => (
              <div key={field.key}>
                <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>
                  {field.label} {field.required && '*'}
                </label>
                <input
                  type={field.type}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '4px' }}>
                Language
              </label>
              <select
                value={form.language}
                onChange={e => setForm({ ...form, language: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="ml">Malayalam</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={handleSubmit}
              style={{
                backgroundColor: '#1a56db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                cursor: 'pointer'
              }}
            >
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Patient List */}
      {patients.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
          color: '#6b7280'
        }}>
          No patients yet. Add your first patient above.
        </div>
      ) : (
        patients.map(patient => (
          <PatientCard key={patient.id} patient={patient} />
        ))
      )}
    </div>
  )
}