import client from './client'

export const getFamilyContacts = (patientId) =>
  client.get(`/family/${patientId}`)

export const createFamilyContact = (data) =>
  client.post('/family/', data)

export const deleteFamilyContact = (id) =>
  client.delete(`/family/${id}`)