import { useState, useEffect } from 'react'
import PatientCard from '../components/PatientCard'
import { getPatients, createPatient } from '../api/patients'

export default function Patients() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', age: '', language: 'en', clinical_conditions: '', baseline_bp: '', timezone: 'Asia/Kolkata'
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
      })
      setShowForm(false)
      setForm({ name: '', phone: '', age: '', language: 'en', clinical_conditions: '', baseline_bp: '', timezone: 'Asia/Kolkata' })
      fetchPatients()
    } catch (err) {
      console.error(err)
      alert('Error creating patient')
    }
  }

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-muted)' }}>Loading...</div>
  )

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Patients
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-premium btn-success"
          style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: 'var(--primary-color)' }}
        >
          + Add Patient
        </button>
      </div>

      {showForm && (
        <div className="card-premium">
          <h3 style={{ marginBottom: '8px', color: 'var(--neutral-dark)', fontSize: '16px', fontWeight: '700' }}>New Patient</h3>
          <p className="card-text-secondary" style={{ marginBottom: '16px' }}>
            A unique onboarding link will be generated automatically. Share it with the patient to connect their Telegram.
          </p>
          <div className="grid-1-1" style={{ gap: '12px' }}>
            {[
              { key: 'name', label: 'Full Name', type: 'text', required: true },
              { key: 'phone', label: 'Phone', type: 'text', required: true },
              { key: 'age', label: 'Age', type: 'number' },
            ].map(field => (
              <div key={field.key}>
                <label style={{ fontSize: '13px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                  {field.label} {field.required && '*'}
                </label>
                <input
                  type={field.type}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--neutral-border)',
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--neutral-dark)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '13px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                Language
              </label>
              <select
                value={form.language}
                onChange={e => setForm({ ...form, language: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--neutral-border)',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--neutral-dark)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="ml">Malayalam</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                Baseline BP
              </label>
              <input
                type="text"
                placeholder="e.g. 120/80"
                value={form.baseline_bp}
                onChange={e => setForm({ ...form, baseline_bp: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--neutral-border)',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--neutral-dark)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                Timezone
              </label>
              <input
                type="text"
                placeholder="e.g. Asia/Kolkata"
                value={form.timezone}
                onChange={e => setForm({ ...form, timezone: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--neutral-border)',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--neutral-dark)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '13px', color: 'var(--neutral-text)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                Clinical Conditions
              </label>
              <textarea
                placeholder="e.g. Type 2 Diabetes, Hypertension, Mild Osteoarthritis"
                value={form.clinical_conditions}
                onChange={e => setForm({ ...form, clinical_conditions: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--neutral-border)',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--neutral-dark)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  minHeight: '60px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={handleSubmit}
              className="btn-premium btn-success"
              style={{ padding: '8px 20px', backgroundColor: 'var(--primary-color)' }}
            >
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-premium btn-primary-outline"
              style={{ padding: '8px 20px', border: '1px solid var(--neutral-border)', color: 'var(--neutral-text)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {patients.length === 0 ? (
        <div className="empty-state-card">
          No patients yet. Add your first patient above.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
          marginTop: '8px'
        }}>
          {patients.map(patient => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      )}
    </div>
  )
}