/**
 * Embed class
 * A mount point for embedding Presto instances on a web page.
 */
class Embed {
  /**
   * Initiates an Embed instance
   * @param {HTMLElement | DOMString} sel CSS selector string
   * @param {Object} options UI options
   * @constructor
   */
  constructor(elSel, options = {}) {
    this.$el = elSel instanceof HTMLElement ? elSel : document.querySelector(elSel);
    this.$iframe = document.createElement('iframe')
    this.options = options    

    if (!this.$el) {
      throw new Error(`Element '${elSel}' not found. Could not mount Proxypay.`)
    }
  }

  /**
   * Mounts the embed in the given payment instance once the invoice is loaded.
   * @param {Presto} payment Presto payment instance
   * @async
   * @returns {Promise}
   */
  async mount(payment) {
    this.$iframe.frameBorder = '0'
    this.$iframe.style.display = 'block'
    this.$iframe.style.width = '100%'
    this.$iframe.style.maxWidth = '760px'
    this.$iframe.style.height = '640px'

    if (this.options.transparent) {
      this.$iframe.style.backgroundColor = 'transparent'
      this.$iframe.allowTransparency = 'true'
    }

    return new Promise((resolve, reject) => {
      payment.on('invoice', invoice => {
        if (this.$el.contains(this.$iframe)) resolve(this);
        this.$el.innerHTML = ''
        this.$el.appendChild(this.$iframe)
        this.$iframe.setAttribute('src', invoice.invoice_url)
        this.$iframe.onload = _ => resolve(this)
        this.$iframe.onerror = reject
      })
    })
  }
}


export default function(sel, options = {}) {
  return new Embed(sel, options)
}