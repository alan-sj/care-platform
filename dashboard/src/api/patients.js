import client from './client'

export const getPatients = () => client.get('/patients/')
export const getPatient = (id) => client.get(`/patients/${id}`)
export const createPatient = (data) => client.post('/patients/', data)
export const deletePatient = (id) => client.delete(`/patients/${id}`)
export const getOnboardingLink = (id) => client.get(`/patients/${id}/onboarding-link`)