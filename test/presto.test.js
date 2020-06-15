import { assert } from 'chai'
import bsv from 'bsv'
import Presto from '../src/index'

let key, wif;
before(() => {
  wif = 'L3ucptoJ7YdYMh4JRFGWF75Nknx95Aw1KBaXWCvFcMj6swJkYvgu'
  key = bsv.PrivKey.fromWif(wif)
})


describe('new Presto', () => {
  it('creates payment from a WIF key', () => {
    const pay = new Presto({ key: wif })
    assert.deepEqual(pay.privKey, key)
  })

  it('creates payment from existing key', () => {
    const pay = new Presto({ key })
    assert.deepEqual(pay.privKey, key)
  })

  it('throws error without any key', () => {
    assert.throws(_ => new Presto(), 'Must initiate Presto with valid private key')
  })

  it('throws error with invalid key', () => {
    assert.throws(_ => new Presto({key: 'NOTAKEY'}))
  })

  it('creates payment with outputs', () => {
    const pay = new Presto({
      key,
      outputs: [
        {to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 50000},
        {data: ['0xeeefef', 'foo', 'bar']}
      ]
    })
    assert.equal(pay.builder.txOuts[0].valueBn.toNumber(), 50000)
    assert.isTrue(pay.builder.txOuts[0].script.isPubKeyHashOut())
    assert.equal(pay.builder.txOuts[1].valueBn.toNumber(), 0)
    assert.isTrue(pay.builder.txOuts[1].script.isSafeDataOut())
  })

  it('creates payment with inputs', () => {
    const pay = new Presto({
      key,
      inputs: [{
        txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
        vout: 0,
        satoshis: 15399,
        script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
      }]
    })
    assert.isTrue(pay.builder.txIns[0].script.isPubKeyHashIn())
    assert.include(Object.keys(pay.builder.uTxOutMap.toJSON()), '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12:0')
  })
})


describe('Presto#address', () => {
  it('returns the public address of the configured key', () => {
    const pay = new Presto({ key })
    assert.equal(pay.address, '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq')
  })
})


//describe('test', () => {
//  it('foo', () => {
//    let builder = new bsv.TxBuilder()
//    console.log(builder)
//    assert.isTrue(true)
//  })
//})