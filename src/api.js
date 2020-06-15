import fetch from 'node-fetch'

// Constants
const BASE_URL = 'https://www.paypresto.co/api'

/**
 * TODO
 */
export default {
  /**
   * TODO
   */
  get(path, options = {}) {
    return this.request('GET', path, null, options)
  },

  /**
   * TODO
   */
  post(path, data = {}, options = {}) {
    return this.request('POST', path, JSON.stringify(data), options)
  },

  /**
   * TODO
   */
  request(method, path, body, {headers} = {}) {
    const config = {
      method,
      body,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json; charset=utf-8',
        ...headers
      }
    }

    return fetch(BASE_URL + path, config)
      .then(async res => {
        const data = await res.json()
        return res.ok ? data : Promise.reject(data)
      })
  }
}