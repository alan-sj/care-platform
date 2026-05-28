import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import AlertCard from '../components/AlertCard'
import { getPatients } from '../api/patients'
import { getOpenAlerts, acknowledgeAlert, resolveAlert } from '../api/alerts'

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [patientsRes, alertsRes] = await Promise.all([
        getPatients(),
        getOpenAlerts()
      ])
      setPatients(patientsRes.data)
      setAlerts(alertsRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getPatientName = (patientId) => {
    const patient = patients.find(p => p.id === patientId)
    return patient ? patient.name : patientId.slice(0, 8) + '...'
  }

  const handleAcknowledge = async (id) => {
    await acknowledgeAlert(id)
    fetchData()
  }

  const handleResolve = async (id) => {
    await resolveAlert(id)
    fetchData()
  }

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
      Loading...
    </div>
  )

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high')

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '24px' }}>
        Overview
      </h1>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <StatCard title="Total Patients" value={patients.length} color="#1a56db" icon="👥" />
        <StatCard title="Open Alerts" value={alerts.length} color="#ef4444" icon="🔔" />
        <StatCard title="High Priority" value={criticalAlerts.length} color="#f97316" icon="🚨" />
        <StatCard title="Patients Active" value={patients.filter(p => p.telegram_chat_id).length} color="#10b981" icon="✅" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a5f' }}>
          Open Alerts
        </h2>
        <button
          onClick={() => navigate('/alerts')}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #1a56db',
            color: '#1a56db',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          View All
        </button>
      </div>

      {alerts.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
          color: '#6b7280',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          ✅ No open alerts right now
        </div>
      ) : (
        alerts.slice(0, 5).map(alert => (
          <AlertCard
            key={alert.id}
            alert={alert}
            patientName={getPatientName(alert.patient_id)}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
          />
        ))
      )}
    </div>
  )
}