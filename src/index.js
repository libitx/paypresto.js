import {
  Address,
  KeyPair,
  PrivKey
} from 'bsv'
import { Forge } from 'txforge/src'
import energy from 'energy'
import api from './api'
import embed from './ui/embed'


// Constants
const DUST_LIMIT = 546;
const HTTP_ORIGIN = process.env.API_HOST === undefined ?
  'https://www.paypresto.co' :
  process.env.API_HOST;

// Default miner rates
const minerRates = {
  data: 0.5,
  standard: 0.5
}

// Presto default options
const defaults = {
  inputs: [],
  outputs: [],
  rates: minerRates,
  debug: false
}


/**
 * Presto class
 * Create invoices on the PayPresto platform with custom built transactions.
 */
class Presto {
  /**
   * Builds a Presto payment instance.
   * @param {Object} options Payment options
   * @constructor
   */
  constructor(options = {}) {
    // Build options
    this.options = {
      ...defaults,
      ...options
    }

    // Set keyPair
    if (this.options.key && typeof this.options.key === 'string') {
      this.privKey = PrivKey.fromWif(this.options.key)
    } else {
      this.privKey = this.options.key
    }

    // Validate private key
    if (!this.privKey || !this.privKey.validate()) {
      throw new Error('Must initiate Presto with valid private key') 
    }

    // Setup
    this.$events = energy()
    this.invoice = null
    this.token = null

    // Build the tx
    this.forge = new Forge({
      inputs: this.options.inputs,
      outputs: this.options.outputs,
      options: { rates: this.options.rates }
    })
    this.forge.changeTo = this.options.changeAddress ?
      this.options.changeAddress :
      this.address

    debug.call(this, 'Presto', this.address, {
      inputs: this.forge.inputs,
      outputs: this.forge.outputs
    })
  }

  /**
   * Builds a Presto payment instance with the given options and creates a new
   * PayPresto invoice.
   * @param {Object} options Payment options
   * @returns {Presto}
   */
  static create(options) {
    const payment = new this(options)
    return payment.createInvoice()
  }

  /**
   * Builds a Presto payment instance with the given options and loads an
   * existing PayPresto invoice.
   * @param {String} invoiceId Invoice ID
   * @param {Object} options Payment options
   * @returns {Presto}
   */
  static load(invoiceId, options) {
    const payment = new this(options)
    return payment.loadInvoice(invoiceId)
  }

  /**
   * Returns the payment funding address.
   * @type {String}
   */
  get address() {
    return Address.fromPrivKey(this.privKey).toString()
  }

  /**
   * Returns the total amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get amount() {
    const value = this.forge.outputSum + this.forge.estimateFee()
    return Math.max(value, DUST_LIMIT + 1)
  }

  /**
   * Returns the remaining amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get remainingAmount() {
    const value = this.amount - this.forge.inputSum
    return value <= 0 ? 0 : Math.max(value, DUST_LIMIT + 1)
  }

  /**
   * Returns the payment funding script as a hex encoded string.
   * @type {String}
   */
  get script() {
    // TODO - support additional script types
    return Address.fromString(this.address).toTxOutScript().toHex()
  }

  /**
   * Adds the given input attributes to the payment.
   * @param {Object} input UTXO input attributes
   * @returns {Presto}
   */
  addInput(input) {
    this.forge.addInput(input)
    if (this.remainingAmount <= 0) {
      this.$events.emit('funded', this)
    }
    return this
  }

  /**
   * Adds the given output attributes to the payment.
   * @param {Object} output transaction output attributes
   * @returns {Presto}
   */
  addOutput(output) {
    this.forge.addOutput(output)
    return this
  }

  /**
   * Creates a PayPresto invoice and attaches the invoice object to the payment.
   * @emits Presto#invoice
   * @returns {Presto}
   */
  createInvoice() {
    const invoice = {
      satoshis: this.remainingAmount,
      script: this.script,
      description: this.options.description
    }
    debug.call(this, 'Creating invoice', invoice)

    api.post('/invoices', { invoice })
      .then(({ data }) => {
        debug.call(this, 'Created invoice', data)
        this.invoice = data
        this.$events.emit('invoice', this.invoice)
      })
      .catch(err => {
        this.$events.emit('error', err)
      })
    
    return this
  }

  /**
   * Loads a PayPresto invoice and attaches the invoice object to the payment.
   * @param {String} invoiceId Invoice ID 
   * @emits Presto#invoice
   * @returns {Presto}
   */
  loadInvoice(invoiceId) {
    debug.call(this, 'Loading invoice', invoiceId)

    api.get(`/invoices/${ invoiceId }`)
      .then(({ data }) => {
        debug.call(this, 'Loaded invoice', data)
        this.invoice = data
        this.$events.emit('invoice', this.invoice)
      })
      .catch(err => {
        this.$events.emit('error', err)
      })

    return this
  }

  /**
   * Gets the signed raw transaction and pushes it to miners, via the mount
   * point window.
   * @returns {Presto}
   */
  pushTx() {
    const rawtx = this.getSignedTx()
    debug.call(this, 'Pushing tx', this.builder.tx.id)
    this.postMessage('tx.push', { rawtx })
    return this
  }

  /**
   * Builds and signs the tx, returning the rawtx hex string.
   * @returns {String}
   */
  getSignedTx() {
    if (this.remainingAmount > 0) {
      throw new Error('Insufficient inputs')
    }

    const keyPair = KeyPair.fromPrivKey(this.privKey)
    this.forge
      .build({ useAllInputs: true })
      .sign({ keyPair })
    
    return this.forge.tx.toHex()
  }

  /**
   * Mounts the payment in the given mount point. The mount point must be a class
   * insctance that responds to the `mount()` function.
   * @param {Embed} point mount point
   * @returns {Presto}
   */
  mount(point) {
    window.addEventListener('message', event => {
      if (event.origin === HTTP_ORIGIN && !!event.data.payload) {
        this.handleMessage(event.data)
      }
    }, false)

    point.mount(this)
      .then(ui => {
        debug.call(this, 'Proxypay mounted', ui)
        this.$ui = ui
        this.postMessage('handshake')
        this.postMessage('configure', this.$ui.options)
      })
      .catch(err => {
        this.$events.emit('error', err)
      })

    return this
  }

  /**
   * Posts a message to the mount point window.
   * @param {String} event Event name
   * @param {any} payload Event payload
   */
  postMessage(event, payload) {
    if (!this.$ui) return;
    this.$ui.$iframe.contentWindow.postMessage({
      event,
      payload
    }, HTTP_ORIGIN)
  }

  /**
   * Handles incoming messages from the mount point
   * @param {Object} message Event message object
   */
  handleMessage({event, payload}) {
    debug.call(this, 'Iframe msg', event, payload)
    switch(event) {
      case 'invoice.status':
        this.addInput(payload.utxos)
        break;
      case 'tx.success':
        this.$events.emit('success', payload.txid)
        break;
      case 'tx.failure':
        this.$events.emit('error', payload.resultDescription || payload.error || payload)
        break;
      case 'tx.error':
        this.$events.emit('error', payload.error || payload)
        break;
      case 'resize':
        this.$ui.$iframe.style.height = payload.height + 'px'
        break
    }
  }

  /**
   * Add an event listener for the specified event.
   * @param {String} event Event name
   * @param {Function} callback Event listener
   * @returns {Presto}
   */
  on(event, callback) {
    this.$events.on(event, callback)
    return this
  }

  /**
   * Add a one-time event listener for the specified event.
   * @param {String} event Event name
   * @param {Function} callback Event listener
   * @returns {Presto}
   */
  once(event, callback) {
    this.$events.once(event, callback)
    return this
  }
}


// Log the given arguments if debug mode enabled
function debug(...args) {
  if (this.options.debug) {
    console.log(...args)
  }
}


export { Presto, embed }