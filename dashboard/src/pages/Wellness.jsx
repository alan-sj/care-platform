import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPatients } from '../api/patients'
import { getLatestWellnessScore } from '../api/wellness'

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

const moodEmoji = { good: '😊', okay: '😐', bad: '😔', unknown: '❓' }
const painEmoji = { none: '✅', mild: '🟡', moderate: '🟠', severe: '🔴', unknown: '❓' }

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
      style={{
        padding: '5px 14px', borderRadius: '20px', fontSize: '13px',
        cursor: 'pointer', fontWeight: active ? '600' : '400',
        border: active ? '1.5px solid #1e3a5f' : '1px solid #e5e7eb',
        backgroundColor: active ? '#1e3a5f' : 'white',
        color: active ? 'white' : '#374151'
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: '32px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e3a5f', marginBottom: '4px' }}>
          Wellness Overview
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          Daily check-in scores across all patients
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Avg Score', value: avgScore ?? '—', color: '#1e3a5f' },
          { label: 'Critical (≤4)', value: criticalCount, color: '#dc2626' },
          { label: 'Good (≥8)', value: goodCount, color: '#16a34a' },
          { label: 'No Check-in', value: noDataCount, color: '#9ca3af' },
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
            padding: '6px 12px', border: '1px solid #e5e7eb',
            borderRadius: '6px', fontSize: '13px', backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="score_asc">Sort: Score (low first)</option>
          <option value="score_desc">Sort: Score (high first)</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Patient wellness grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px', backgroundColor: 'white', borderRadius: '10px' }}>
          Loading wellness data...
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '10px',
          padding: '48px', textAlign: 'center',
          border: '1px dashed #e2e8f0'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🌟</div>
          <div style={{ color: '#64748b', fontSize: '14px' }}>No patients match this filter.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
          {sorted.map(p => {
            const w = p.wellness
            const sc = scoreColor(p.score)
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/patients/${p.id}`)}
                style={{
                  backgroundColor: 'white', borderRadius: '10px',
                  padding: '18px 20px', cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                  border: p.score !== null && p.score <= 4
                    ? '1px solid #fecaca'
                    : '1px solid #f1f5f9',
                  transition: 'box-shadow 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      Age {p.age || '?'} · {p.language?.toUpperCase()}
                    </div>
                  </div>
                  <span style={{
                    backgroundColor: sc.bg, color: sc.color,
                    fontSize: '11px', fontWeight: '600',
                    padding: '3px 9px', borderRadius: '12px'
                  }}>
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
                      { label: 'Mood', value: `${moodEmoji[w.mood] || '❓'} ${w.mood || '—'}` },
                      { label: 'Pain', value: `${painEmoji[w.pain] || '❓'} ${w.pain || '—'}` },
                      { label: 'Eating', value: w.eating === 'yes' ? '✅ Yes' : w.eating === 'no' ? '❌ No' : w.eating === 'partial' ? '🟡 Partial' : '❓ —' },
                      { label: 'Sleep', value: w.sleep || '—' },
                    ].map(item => (
                      <div key={item.label} style={{
                        backgroundColor: '#f8fafc', borderRadius: '6px',
                        padding: '6px 8px'
                      }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: '12px', color: '#374151', fontWeight: '500' }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    marginTop: '12px', fontSize: '12px', color: '#94a3b8',
                    textAlign: 'center', padding: '8px',
                    backgroundColor: '#f9fafb', borderRadius: '6px'
                  }}>
                    No check-in data yet
                  </div>
                )}

                {w?.concerns && (
                  <div style={{
                    marginTop: '10px', fontSize: '12px', color: '#92400e',
                    backgroundColor: '#fffbeb', borderRadius: '6px',
                    padding: '6px 10px', borderLeft: '3px solid #fbbf24'
                  }}>
                    ⚠️ {w.concerns}
                  </div>
                )}

                {w?.checked_at && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
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