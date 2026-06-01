import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Alerts from './pages/Alerts'
import Schedule from './pages/Schedule'
import Wellness from './pages/Wellness'
import Notes from './pages/Notes'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/wellness" element={<Wellness />} />
          <Route path="/notes" element={<Notes />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}