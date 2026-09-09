import fs from 'node:fs'

export function createResponseCapture({ write = fs.writeFileSync, persist = () => {} } = {}) {
  const pending = [], errors = []
  let closing = false
  return {
    track(operation) {
      if (closing) return Promise.reject(Error('SWEEP_EVIDENCE_DRAINING'))
      const request = Promise.resolve().then(operation)
      // Register before invoking transport, including the wait for response headers.
      pending.push(request.catch(() => {}))
      return request
    },
    capture(response, file, record) {
      record.httpStatus = response.status
      persist()
      pending.push(response.text().then(text => {
        write(file, text, { mode: 0o600 })
        try {
          const error = JSON.parse(text)?.error
          if (error && (typeof error === 'string' || typeof error === 'object')) record.providerError = error
        } catch { /* SSE and plain text remain verbatim evidence. */ }
      }).catch(error => {
        errors.push({ file, message: String(error.message ?? error) })
      }).finally(persist))
    },
    async drain() {
      closing = true
      // A tracked request may register its response body while headers are awaited.
      for (let index = 0; index < pending.length; index++) {
        try { await pending[index] }
        catch (error) { errors.push({ file: null, message: String(error.message ?? error) }) }
      }
      return errors
    },
  }
}

export function providerFailure(records) {
  const failed = records.find(row => row.httpStatus >= 400 || row.providerError)
  return failed ? `Provider HTTP ${failed.httpStatus}: ${JSON.stringify(failed.providerError ?? 'see raw response').slice(0, 1200)}` : null
}
