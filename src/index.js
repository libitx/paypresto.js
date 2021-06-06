import {
  Address,
  KeyPair,
  PrivKey
} from 'bsv'
import { Forge } from 'txforge'
import energy from 'energy'
import api from './api'
import embed from './ui/embed'


// Constants
const DUST_LIMIT = 140
const HTTP_ORIGIN = 'https://www.paypresto.co'

// Presto default options
const defaults = {
  inputs: [],
  outputs: [],
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

    // Setup
    this.mode = 'simple'
    this.$events = new energy()
    this.invoice = null
    this.funded = false

    // Build the forge, either from existing instance or given params
    if (this.options.forge) {
      this.forge = this.options.forge
    } else {
      const forgeOpts = ['debug', 'rates'].reduce((opts, key) => {
        if (typeof this.options[key] !== 'undefined') { opts[key] = this.options[key] }
        return opts
      }, {})
      this.forge = new Forge({
        inputs: this.options.inputs,
        outputs: this.options.outputs,
        options: forgeOpts
      })
    }

    // Set keyPair
    if (this.options.key) {
      this.mode = 'proxypay'
      if (typeof this.options.key === 'string') {
        try {
          this.privKey = PrivKey.fromWif(this.options.key)
        } catch(e) { /* Do nothing - raise a useful error below */ }
        
      } else if (this.options.key.bn) {
        this.privKey = this.options.key
      }
    }

    // In simple mode validate that every given output is a P2PKH script
    if (this.mode === 'simple') {
      if (!this.forge.outputs.every(o => {
        const s = o.getScript()
        return  s.chunks[0].opCodeNum === 118 &&
                s.chunks[1].opCodeNum === 169 &&
                s.chunks[2].opCodeNum === 20 && s.chunks[2].len === 20 &&
                s.chunks[3].opCodeNum === 136 &&
                s.chunks[4].opCodeNum === 172
      })) {
        throw new Error('Must initiate Presto with P2PKH outputs only in `simple` mode') 
      }
    }
    
    // In proxypay mode validate the private key
    if (this.mode === 'proxypay') {
      // Validate private key
      if (!this.privKey) {
        throw new Error('Must initiate Presto with valid private key in `proxypay` mode') 
      }

      // Setup change address
      this.forge.changeTo = this.options.changeAddress ?
        this.options.changeAddress :
        this.address.toString()
    }

    debug.call(this, 'Presto', this.mode, this.forge)
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
   * @type {Address}
   */
  get address() {
    return Address.fromPrivKey(this.privKey)
  }

  /**
   * Returns the payment keyPair.
   * @type {KeyPair}
   */
  get keyPair() {
    return KeyPair.fromPrivKey(this.privKey)
  }

  /**
   * Returns the total amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get amount() {
    return this.forge.outputSum + this.forge.estimateFee(this.forge.options.rates, !this.funded)
  }

  /**
   * Returns the remaining amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get amountDue() {
    const value = this.amount - this.forge.inputSum
    return Math.max(value, 0)
  }

  /**
   * Returns the payment funding script as a hex encoded string.
   * @type {String}
   */
  get script() {
    // TODO - support additional script types
    return this.address.toTxOutScript().toHex()
  }

  /**
   * Adds the given input attributes to the payment.
   * @param {Object} input UTXO input attributes
   * @returns {Presto}
   */
  addInput(input) {
    this.forge.addInput(input)
    if (this.amountDue <= 0) {
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
      currency: this.options.currency,
      description: this.options.description,
      outputs: []
    }

    if (this.mode === 'simple') {
      invoice.outputs = this.forge.outputs.map(o => {
        return {
          satoshis: o.satoshis,
          script: o.getScript().toHex()
        }
      })
    } else {
      invoice.outputs.push({
        satoshis: Math.max(this.amountDue, DUST_LIMIT),
        script: this.script
      })
    }

    if (!!this.options.appIdentifier || !!this.options.app_identifier) {
      invoice.app_identifier = this.options.appIdentifier || this.options.app_identifier
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
   * Pushes the tx to miners via the mount point window.
   * If the tx hasn't been built, it attempts to do so with `signTx()`.
   * @returns {Presto}
   */
  pushTx() {
    if (this.amountDue > 0) {
      debug.call(this, 'Presto', 'Insufficient inputs', this.forge)
      throw new Error('Insufficient inputs')
    }

    // If needed, attempt to build and sign tx with privKey
    if (
      this.forge.tx.txIns.length < this.forge.inputs.length ||
      this.forge.tx.txOuts.length < this.forge.outputs.length
    ){
      this.signTx()
    }

    const rawtx = this.getRawTx()
    debug.call(this, 'Pushing tx', this.forge.tx.id())
    this.postMessage('tx.push', { rawtx })
    return this
  }

  /**
   * Signs the transaction inputs with the private key. 
   * Can optionally be given additional signing params.
   * @param {Object} params Signing params
   * @returns {Presto}
   */
  signTx(params = {}) {
    this.forge
      .build()
      .sign({ keyPair: this.keyPair, ...params })

    return this
  }

  /**
   * Signs the transaction input specified by the given `txInNum`.
   * This is for advanced use where individual inputs require custom signing
   * params. Must build the tx before using `payment.forge.build()`
   * @param {Number} txInNum Input index
   * @param {Object} params Signing params
   * @returns {Presto}
   */
  signTxIn(txInNum, params) {
    this.forge.signTxIn(txInNum, params)
    return this
  }

  /**
   * Returns the rawtx hex string. Should be called after `signTx()` or
   * `signTxIn()`.
   * @returns {String}
   */
  getRawTx() {
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
      if (
        event.origin === HTTP_ORIGIN &&
        !!event.data.payload &&
        event.source === this.$ui.$iframe.contentWindow
      ) {
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
        // In simple mode when complete immediately fire sucecss
        // We itereate over the txns but in practice there will only be one
        if (this.mode === 'simple' && payload.status === 'complete') {
          Object.keys(payload.txns)
            .forEach(txid => {
              this.$events.emit('success', {
                txid,
                rawtx: payload.txns[txid]
              })
            })
        }
        // In proxypay mode add inputs to the forge instance
        if (this.mode === 'proxypay') {
          this.addInput(payload.utxos)
          this.funded = true
        }
        break;
      case 'tx.success':
        this.$events.emit('success', {
          txid: payload.txid,
          rawtx: this.getRawTx()
        })
        break;
      case 'tx.failure':
        this.$events.emit('error', payload.resultDescription || payload.error || payload)
        break;
      case 'tx.error':
        this.$events.emit('error', payload.error || payload)
        break;
      case 'wallet.open':
        window.location = payload.url
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