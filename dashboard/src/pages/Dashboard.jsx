import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import AlertCard from '../components/AlertCard'
import { getPatients } from '../api/patients'
import { getOpenAlerts, acknowledgeAlert, resolveAlert } from '../api/alerts'
import * as Icons from '../components/Icons'

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
    <div className="page-container">
      <h1 className="page-title">
        Overview
      </h1>

      <div className="stats-grid">
        <StatCard title="Total Patients" value={patients.length} icon={<Icons.Users size={16} />} />
        <StatCard title="Open Alerts" value={alerts.length} icon={<Icons.Bell size={16} />} />
        <StatCard title="High Priority" value={criticalAlerts.length} icon={<Icons.AlertTriangle size={16} />} />
        <StatCard title="Patients Active" value={patients.filter(p => p.telegram_chat_id).length} icon={<Icons.Activity size={16} />} />
      </div>

      <div className="alerts-header-row">
        <h2 className="alerts-header-title">
          Open Alerts
        </h2>
        <button
          onClick={() => navigate('/alerts')}
          className="btn-primary-outline"
        >
          View All
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state-card">
          No open alerts right now
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