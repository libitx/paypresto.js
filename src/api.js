import fetch from 'node-fetch'

// Constants
const BASE_URL = 'https://www.paypresto.co/api'

/**
 * Module for interfacing with the PayPresto API. Uses browser fetch API.
 */
export default {
  /**
   * Dispatch a GET request.
   * @param {String} path API endpoint path
   * @param {Object} options HTTP request options
   */
  async get(path, options = {}) {
    return this.request('GET', path, null, options)
  },

  /**
   * Dispatch a POST request.
   * @param {String} path API endpoint path
   * @param {Object} data Request data payload
   * @param {Object} options HTTP request options
   */
  async post(path, data = {}, options = {}) {
    return this.request('POST', path, JSON.stringify(data), options)
  },

  /**
   * Dispatch an HTTP request.
   * @param {String} method HTTP method verb
   * @param {String} path API endpoint path
   * @param {String} body Request data payload
   * @param {Object} options HTTP request options
   */
  async request(method, path, body, {headers} = {}) {
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