import client from './client'

export const getPatientMedications = (patientId) => 
  client.get(`/medications/patient/${patientId}`)

export const createMedication = (data) => 
  client.post('/medications/', data)

export const deleteMedication = (id) => 
  client.delete(`/medications/${id}`)

export const getPatientLogs = (patientId) =>
  client.get(`/medications/logs/${patientId}`)