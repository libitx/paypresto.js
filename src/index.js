import bsv from 'bsv'
import energy from 'energy'
import api from './api'

// Constants
const DUST_LIMIT = 546 + 1;

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
 * TODO
 */
class Presto {
  /**
   * TODO
   */
  constructor(options) {
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
   * TODO
   */
  static create(options) {
    const pay = new this(options)
    // /pay.createInvoice()
    return pay
  }

  /**
   * TODO
   */
  static load(id, options) {
    const pay = new this(options)
    //pay.loadInvoice(id)
    return pay
  }

  /**
   * TODO
   */
  get address() {
    return bsv.Address.fromPrivKey(this.privKey)
  }

  /**
   * TODO
   */
  get amount() {
    const satoshis = this.builder.txOuts
      .reduce((acc, o) => acc.add(o.valueBn), bsv.Bn(0))
      .add(estimateFee(this.builder))
      .toNumber()
    return Math.max(satoshis, DUST_LIMIT)
  }

  /**
   * TODO
   */
  get remainingAmount() {
    const satoshis = this.builder.txIns
      .map(i => this.builder.uTxOutMap.get(i.txHashBuf, i.txOutNum))
      .reduce((acc, o) => acc.add(o.valueBn), bsv.Bn(0))
      .toNumber()
    return Math.max(this.amount - satoshis, 0)
  }

  /**
   * TODO
   */
  get script() {
    // TODO - support additional script types
    return this.address.toTxOutScript()
  }

  /**
   * TODO
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
   * TODO
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
}


// TODO
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


// TODO
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


// Private debug
function debug(...args) {
  if (this.options.debug) {
    console.log(...args)
  }
}


export default Presto