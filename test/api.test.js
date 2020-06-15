import { assert } from 'chai'
import nock from 'nock'
import api from '../src/api'


describe('api.get()', () => {
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .get('/api/ok')
      .once()
      .reply(200, '{"success": "ok"}', {
        'Content-Type': 'application/json'
      })

    nock('https://www.paypresto.co')
      .get('/api/err')
      .once()
      .reply(400, '{"error": "err"}', {
        'Content-Type': 'application/json'
      })
  })

  it('should respond when successful', () => {
    return api.get('/ok')
      .then(res => assert.equal(res.success, 'ok'))
      .catch(err => { throw err })
  })

  it('should reject when unsuccessful', () => {
    return api.get('/err')
      .then(_res => { throw new Error('was supposed to reject') })
      .catch(err => assert.equal(err.error, 'err'))
  })
})


describe('api.post()', () => {
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .post('/api/ok')
      .once()
      .reply(200, '{"success": "ok"}', {
        'Content-Type': 'application/json'
      })

    nock('https://www.paypresto.co')
      .post('/api/err')
      .once()
      .reply(400, '{"error": "err"}', {
        'Content-Type': 'application/json'
      })
  })

  it('should respond when successful', () => {
    return api.post('/ok')
      .then(res => assert.equal(res.success, 'ok'))
      .catch(err => { throw err })
  })

  it('should reject when unsuccessful', () => {
    return api.post('/err')
      .then(_res => { throw new Error('was supposed to reject') })
      .catch(err => assert.equal(err.error, 'err'))
  })
})