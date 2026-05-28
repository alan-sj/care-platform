import axios from 'axios'

const client = axios.create({
  baseURL: 'http://localhost:8001',
  headers: {
    'Content-Type': 'application/json'
  }
})

export default client