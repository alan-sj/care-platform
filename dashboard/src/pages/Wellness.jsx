import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatients } from '../api/patients'
import { getLatestWellnessScore } from '../api/wellness'
import * as Icons from '../components/Icons'

const scoreColor = (score) => {
  if (!score) return { color: '#9ca3af', bg: '#f9fafb', label: 'No data' }
  if (score >= 8) return { color: '#16a34a', bg: '#f0fdf4', label: 'Good' }
  if (score >= 6) return { color: '#ca8a04', bg: '#fefce8', label: 'Fair' }
  if (score >= 4) return { color: '#ea580c', bg: '#fff7ed', label: 'Low' }
  return { color: '#dc2626', bg: '#fef2f2', label: 'Critical' }
}

const scoreBar = (score) => {
  const c = scoreColor(score)
  const pct = score ? (score / 10) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          backgroundColor: c.color, borderRadius: '4px'
        }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: '600', color: c.color, minWidth: '16px' }}>
        {score ?? '—'}
      </span>
    </div>
  )
}

const moodLabel = { good: 'Good', okay: 'Okay', bad: 'Bad', unknown: 'Unknown' }
const painLabel = { none: 'None', mild: 'Mild', moderate: 'Moderate', severe: 'Severe', unknown: 'Unknown' }

export default function Wellness() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [wellnessData, setWellnessData] = useState({})
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('score_asc')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data: pts } = await getPatients()
      setPatients(pts)

      const wResults = await Promise.allSettled(
        pts.map(p => getLatestWellnessScore(p.id).then(r => ({ id: p.id, data: r.data })))
      )
      const wMap = {}
      wResults.forEach(r => {
        if (r.status === 'fulfilled') wMap[r.value.id] = r.value.data
      })
      setWellnessData(wMap)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const enriched = patients.map(p => ({
    ...p,
    wellness: wellnessData[p.id] || null,
    score: wellnessData[p.id]?.score ?? null,
  }))

  const filtered = filter === 'all' ? enriched
    : filter === 'critical' ? enriched.filter(p => p.score !== null && p.score <= 4)
    : filter === 'no_data'  ? enriched.filter(p => p.score === null)
    : enriched.filter(p => p.score !== null && p.score >= 5)

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'score_asc')  return (a.score ?? 11) - (b.score ?? 11)
    if (sortBy === 'score_desc') return (b.score ?? -1) - (a.score ?? -1)
    return a.name.localeCompare(b.name)
  })

  const criticalCount = enriched.filter(p => p.score !== null && p.score <= 4).length
  const goodCount = enriched.filter(p => p.score !== null && p.score >= 8).length
  const noDataCount = enriched.filter(p => p.score === null).length
  const avgScore = (() => {
    const valid = enriched.filter(p => p.score !== null)
    if (!valid.length) return null
    return (valid.reduce((a, b) => a + b.score, 0) / valid.length).toFixed(1)
  })()

  const pill = (label, active, onClick) => (
    <button
      onClick={onClick}
      className={`btn-premium ${active ? 'btn-success' : 'btn-primary-outline'}`}
      style={{
        padding: '6px 14px', borderRadius: '20px', fontSize: '13px',
        fontWeight: active ? '600' : '400',
        backgroundColor: active ? 'var(--primary-color)' : 'var(--card-bg)',
        color: active ? '#ffffff' : 'var(--neutral-text)',
        borderColor: active ? 'var(--primary-color)' : 'var(--neutral-border)'
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="page-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: '4px' }}>
          Wellness Overview
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--neutral-muted)', margin: 0 }}>
          Daily check-in wellness records across all patients
        </p>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Avg Score', value: avgScore ?? '—', color: 'var(--primary-color)' },
          { label: 'Critical (≤4)', value: criticalCount, color: 'var(--error-color)' },
          { label: 'Good (≥8)', value: goodCount, color: 'var(--success-color)' },
          { label: 'No Check-in', value: noDataCount, color: 'var(--neutral-muted)' },
        ].map(s => (
          <div key={s.label} className="card-premium" style={{ padding: '16px 18px', marginBottom: 0 }}>
            <div style={{ fontSize: '12px', color: 'var(--neutral-muted)', marginBottom: '6px', fontWeight: '600' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + sort */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {pill('All', filter === 'all', () => setFilter('all'))}
          {pill(`Critical (${criticalCount})`, filter === 'critical', () => setFilter('critical'))}
          {pill('Okay+', filter === 'okay', () => setFilter('okay'))}
          {pill('No Data', filter === 'no_data', () => setFilter('no_data'))}
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '6px 12px', border: '1px solid var(--neutral-border)',
            borderRadius: 'var(--radius-sm)', fontSize: '13px', backgroundColor: 'var(--card-bg)',
            color: 'var(--neutral-dark)', cursor: 'pointer', outline: 'none'
          }}
        >
          <option value="score_asc">Sort: Score (low first)</option>
          <option value="score_desc">Sort: Score (high first)</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Patient wellness grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--neutral-muted)', padding: '48px', backgroundColor: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
          Loading wellness data...
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty-state-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <Icons.Heart size={24} style={{ color: 'var(--neutral-muted)' }} />
          <div style={{ color: 'var(--neutral-muted)', fontSize: '14px' }}>No patients match this filter.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {sorted.map(p => {
            const w = p.wellness
            const sc = scoreColor(p.score)
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/patients/${p.id}`)}
                className="card-premium card-premium-clickable"
                style={{
                  padding: '18px 20px',
                  border: p.score !== null && p.score <= 4
                    ? '1px solid var(--error-color)'
                    : '1px solid var(--neutral-border)',
                  marginBottom: 0
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--neutral-dark)', fontSize: '15px' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--neutral-muted)', marginTop: '2px' }}>
                      Age {p.age || '?'} · {p.language?.toUpperCase()}
                    </div>
                  </div>
                  <span className={`badge-premium badge-${p.score !== null && p.score <= 4 ? 'danger' : p.score >= 8 ? 'success' : 'warning'}`}>
                    {sc.label}
                  </span>
                </div>

                {scoreBar(p.score)}

                {w && w.score !== null ? (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '6px', marginTop: '12px'
                  }}>
                    {[
                      { label: 'Mood', value: moodLabel[w.mood] || '—' },
                      { label: 'Pain', value: painLabel[w.pain] || '—' },
                      { label: 'Eating', value: w.eating === 'yes' ? 'Yes' : w.eating === 'no' ? 'No' : w.eating === 'partial' ? 'Partial' : '—' },
                      { label: 'Sleep', value: w.sleep || '—' },
                    ].map(item => (
                      <div key={item.label} style={{
                        backgroundColor: 'var(--neutral-bg)', border: '1px solid var(--neutral-border)', borderRadius: '6px',
                        padding: '6px 8px'
                      }}>
                        <div style={{ fontSize: '10px', color: 'var(--neutral-muted)', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--neutral-text)', fontWeight: '600' }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    marginTop: '12px', fontSize: '12px', color: 'var(--neutral-muted)',
                    textAlign: 'center', padding: '8px',
                    backgroundColor: 'var(--neutral-bg)', borderRadius: '6px'
                  }}>
                    No check-in data yet
                  </div>
                )}

                {w?.concerns && (
                  <div style={{
                    marginTop: '10px', fontSize: '12px', color: 'var(--warning-color)',
                    backgroundColor: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px', borderLeft: '3px solid var(--warning-color)',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <Icons.AlertTriangle size={12} style={{ flexShrink: 0 }} /> {w.concerns}
                  </div>
                )}

                {w?.checked_at && (
                  <div style={{ fontSize: '11px', color: 'var(--neutral-muted)', marginTop: '8px' }}>
                    Checked in: {new Date(w.checked_at).toLocaleString()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}