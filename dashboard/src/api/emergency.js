import client from './client'

export const scanAllPatients = () =>
  client.post('/emergency/scan')

export const triggerAssessment = (patientId) =>
  client.post(`/emergency/trigger/${patientId}`)

export const getPatientRiskStatus = (patientId) =>
  client.get(`/emergency/status/${patientId}`)