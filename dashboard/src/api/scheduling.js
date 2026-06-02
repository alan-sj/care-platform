import client from './client'

export const generateSchedule = () =>
  client.post('/scheduling/generate')

export const getTodaySchedule = () =>
  client.get('/scheduling/today')

export const getCoordinatorWorkload = () =>
  client.get('/scheduling/workload')

export const updateVisitStatus = (visitId, status, notes = null) =>
  client.patch(`/scheduling/visit/${visitId}`, { status, notes })

export const createIndividualVisit = (visitData) =>
  client.post('/scheduling/visit', visitData)