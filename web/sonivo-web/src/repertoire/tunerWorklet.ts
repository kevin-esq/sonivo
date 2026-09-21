/**
 * T-FX-01 tuner capture worklet source (ADR-0037).
 *
 * The processor forwards raw mono samples to the main thread, where
 * `detectPitch` (tunerPitch.ts) runs the YIN estimate. No recording, no
 * persistence — buffers are analysed and dropped. Loaded via Blob URL so no
 * extra static asset or bundler worklet plugin is needed.
 */

export const TUNER_WORKLET_NAME = 'sonivo-tuner-capture'

export const TUNER_WORKLET_SOURCE = `
class SonivoTunerCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs && inputs[0] && inputs[0][0]
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0))
    }
    return true
  }
}
registerProcessor('${TUNER_WORKLET_NAME}', SonivoTunerCapture)
`
