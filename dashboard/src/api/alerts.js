import client from './client'

export const getAlerts = () => client.get('/alerts/')
export const getOpenAlerts = () => client.get('/alerts/open')
export const acknowledgeAlert = (id) => client.patch(`/alerts/${id}/acknowledge`)
export const resolveAlert = (id) => client.patch(`/alerts/${id}/resolve`)
export const getPatientAlerts = (patientId) => client.get(`/alerts/patient/${patientId}`)