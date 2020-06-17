import bsv from 'bsv'
import energy from 'energy'
import api from './api'
import embed from './ui/embed'


// Constants
const DUST_LIMIT = 546 + 1;
const HTTP_ORIGIN = process.env.API_HOST === undefined ?
  'https://www.paypresto.co' :
  process.env.API_HOST;


// Default miner rates
// TODO - make configurable
const minerRates = {
  data: 0.5,
  standard: 0.5
}

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

    // Set private key
    if (this.options.key && this.options.key.constructor === bsv.PrivKey) {
      this.privKey = options.key
    } else if (typeof this.options.key === 'string') {
      this.privKey = bsv.PrivKey.fromWif(options.key)
    }

    // Validate private key
    if (!this.privKey || this.privKey.constructor !== bsv.PrivKey) {
      throw new Error('Must initiate Presto with valid private key')
    } else {
      this.privKey.validate()
    }

    // Setup
    this.$events = energy()
    this.invoice = null
    this.token = null

    // Build the tx
    this.builder = new bsv.TxBuilder()
    this.builder.setChangeAddress(
      this.options.changeAddress ?
      new bsv.Address().fromString(this.options.changeAddress) :
      this.address
    )
    this.addOutput(this.options.outputs)
    this.addInput(this.options.inputs)

    debug.call(this, 'Presto', this.address, {
      inputs: this.inputs,
      outputs: this.outputs
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
   * @type {bsv.Address}
   */
  get address() {
    return bsv.Address.fromPrivKey(this.privKey)
  }

  /**
   * Returns the total amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get amount() {
    const value = this.builder.txOuts
      .reduce((acc, o) => acc.add(o.valueBn), bsv.Bn(0))
      .add(estimateFee(this.builder))
      .toNumber()
    return Math.max(value, DUST_LIMIT)
  }

  /**
   * Returns the remaining amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get remainingAmount() {
    const value = this.builder.txIns
      .map(i => this.builder.uTxOutMap.get(i.txHashBuf, i.txOutNum))
      .reduce((acc, o) => acc.add(o.valueBn), bsv.Bn(0))
      .toNumber()
    return Math.max(this.amount - value, 0)
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
    if (Array.isArray(input)) {
      return input.forEach(i => this.addInput(i));
    } else if (isValidInput(input)) {
      this.builder.inputFromPubKeyHash(
        Buffer.from(input.txid, 'hex'),
        Number.isInteger(input.vout) ? input.vout : input.outputIndex,
        bsv.TxOut.fromProperties(
          satoshisToBn(input),
          bsv.Script.fromHex(input.script)
        )
      )
    } else {
      throw new Error('Invalid TxIn params')
    }
    return this
  }

  /**
   * Adds the given output attributes to the payment.
   * @param {Object} output transaction output attributes
   * @returns {Presto}
   */
  addOutput(output) {
    if (Array.isArray(output)) {
      return output.forEach(o => this.addOutput(o));
    } else if (output.constructor === bsv.TxOut) {
      this.builder.txOuts.push(output)
    } else if (output.script) {
      this.builder.outputToScript(
        satoshisToBn(output),
        bsv.Script.fromHex(output.script)
      )
    } else if (output.data) {
      this.builder.outputToScript(
        satoshisToBn(output),
        dataToScript(output.data)
      )
    } else if (output.to) {
      this.builder.outputToAddress(
        satoshisToBn(output),
        new bsv.Address().fromString(output.to)
      )
    } else {
      throw new Error('Invalid TxOut params')
    }
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
        return this
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
        return this
      })
      .catch(err => {
        this.$events.emit('error', err)
      })

    return this
  }

  /**
   * TODO
   */
  mount(el) {
    window.addEventListener('message', event => {
      if (event.origin === HTTP_ORIGIN && !!event.data.payload) {
        this.handleMessage(event.data)
      }
    }, false)

    el.mount(this)
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
   * TODO
   */
  postMessage(event, payload) {
    if (!this.$ui) return;
    this.$ui.$iframe.contentWindow.postMessage({
      event,
      payload
    }, HTTP_ORIGIN)
  }

  /**
   * TODO
   */
  handleMessage({event, payload}) {
    debug.call(this, 'Iframe msg', event, payload)
    switch(event) {
      case 'resize':
        const { height } = payload
        this.$ui.$iframe.style.height = height + 'px'
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


// Converts the given array of data chunks into a OP_RETURN output script
function dataToScript(data) {
  const script = new bsv.Script()
  script.writeOpCode(bsv.OpCode.OP_FALSE)
  script.writeOpCode(bsv.OpCode.OP_RETURN)
  data.forEach(item => {
    // Hex string
    if (typeof item === 'string' && /^0x/i.test(item)) {
      script.writeBuffer(Buffer.from(item.slice(2), 'hex'))
    // Opcode number
    } else if (typeof item === 'number' || item === null) {
      script.writeOpCode(Number.isInteger(item) ? item : 0)
    // Opcode
    } else if (typeof item === 'object' && item.hasOwnProperty('op')) {
      script.writeOpCode(item.op)
    // All else
    } else {
      script.writeBuffer(Buffer.from(item))
    }
  })
  return script
}


// Returns satoshis or amount on object as bignum
function satoshisToBn(data) {
  const val = Number.isInteger(data.satoshis) ? data.satoshis : data.amount;
  return bsv.Bn(val)
}


// Returns true if the given parameters are a valid input UTXO
function isValidInput(data) {
  return ['txid', 'script'].every(k => Object.keys(data).includes(k)) &&
    ['vout', 'outputIndex'].some(k => Object.keys(data).includes(k)) &&
    ['satoshis', 'amount'].some(k => Object.keys(data).includes(k))
}


// Estimate the fee for the given tx builder
// Uses technique used in minercraft and manic
function estimateFee(builder, rates = minerRates) {
  const parts = [
    {standard: 4}, // version
    {standard: 4}, // locktime
    {standard: bsv.VarInt.fromNumber(builder.txIns.length).buf.length},
    {standard: bsv.VarInt.fromNumber(builder.txOuts.length).buf.length},
  ]

  if (builder.txIns.length > 0) {
    builder.txIns.forEach(i => {
      if (i.script.isPubKeyHashIn()) {
        parts.push({standard: 148})
      } else {
        // TODO - implement fee calculation for other scripts
        console.warn('Curently unable to calculate fee for custom input script')
      }
    })
  } else {
    parts.push({standard: 148})
  }

  builder.txOuts.forEach(o => {
    const p = {}
    const type = o.script.chunks[0].opcodenum === 0 && o.script.chunks[0].opcodenum === 106 ? 'data' : 'standard';
    p[type] = 8 + o.scriptVi.buf.length + o.scriptVi.toNumber()
    parts.push(p)
  })
  
  const fee = parts.reduce((fee, p) => {
    return Object
      .keys(p)
      .reduce((acc, k) => {
        return acc + (rates[k] * p[k])
      }, fee)
  }, 0)
  return bsv.Bn(fee)
}


// Log the given arguments if debug mode enabled
function debug(...args) {
  if (this.options.debug) {
    console.log(...args)
  }
}


export { Presto, embed }