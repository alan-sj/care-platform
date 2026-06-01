import client from './client'

export const getWellnessLogs = (patientId) =>
  client.get(`/wellness/logs/${patientId}`)

export const getLatestWellnessScore = (patientId) =>
  client.get(`/wellness/score/${patientId}`)

export const sendDailyCheckins = () =>
  client.post('/wellness/send-checkins')

export const checkMissedCheckins = () =>
  client.post('/wellness/check-missed')