import client from './client'

export const submitVisitNote = (patientId, rawNote, coordinatorId = null) =>
  client.post(`/copilot/note/${patientId}`, {
    raw_note: rawNote,
    coordinator_id: coordinatorId,
  })

export const getPatientNotes = (patientId) =>
  client.get(`/copilot/notes/${patientId}`)

export const getSingleNote = (noteId) =>
  client.get(`/copilot/note/${noteId}`)

export const getPendingFollowups = () =>
  client.get('/copilot/followups')