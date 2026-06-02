import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import AlertCard from '../components/AlertCard'
import { getPatients } from '../api/patients'
import { getOpenAlerts, getAlerts, acknowledgeAlert, resolveAlert } from '../api/alerts'
import * as Icons from '../components/Icons'

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
  }, [showAllAlerts])

  useEffect(() => {
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [showAllAlerts])

  const fetchData = async () => {
    try {
      const [patientsRes, alertsRes] = await Promise.all([
        getPatients(),
        showAllAlerts ? getAlerts() : getOpenAlerts()
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
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-muted)' }}>
      Loading...
    </div>
  )

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high')

  return (
    <div className="page-container">
      <h1 className="page-title">
        Alerts Overview
      </h1>

      <div className="stats-grid">
        <StatCard title="Total Patients" value={patients.length} icon={<Icons.Users size={16} />} />
        <StatCard title="Filtered Alerts" value={alerts.length} icon={<Icons.Bell size={16} />} />
        <StatCard title="High Priority" value={criticalAlerts.length} icon={<Icons.AlertTriangle size={16} />} />
        <StatCard title="Patients Active" value={patients.filter(p => p.telegram_chat_id).length} icon={<Icons.Activity size={16} />} />
      </div>

      <div className="alerts-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="alerts-header-title" style={{ margin: 0 }}>
          {showAllAlerts ? 'All Alerts History' : 'Open Alerts List'}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowAllAlerts(false)}
            className="btn-premium"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              backgroundColor: !showAllAlerts ? 'var(--primary-color)' : 'transparent',
              color: !showAllAlerts ? '#ffffff' : 'var(--primary-color)',
              border: !showAllAlerts ? '1px solid var(--primary-color)' : '1px solid var(--neutral-border)',
              fontWeight: '600'
            }}
          >
            Open Alerts
          </button>
          <button
            onClick={() => setShowAllAlerts(true)}
            className="btn-premium"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              backgroundColor: showAllAlerts ? 'var(--primary-color)' : 'transparent',
              color: showAllAlerts ? '#ffffff' : 'var(--primary-color)',
              border: showAllAlerts ? '1px solid var(--primary-color)' : '1px solid var(--neutral-border)',
              fontWeight: '600'
            }}
          >
            All Alerts History
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state-card">
          {showAllAlerts ? 'No alerts found in the database' : 'No open alerts right now'}
        </div>
      ) : (
        alerts.map(alert => (
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