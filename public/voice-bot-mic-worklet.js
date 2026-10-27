// Voice bot test call (voice bot plan wave C): turns the microphone into 16 kHz, 16-bit mono PCM
// and posts it in 20 ms chunks (320 samples). Served from /public so the page's CSP allows it.
class VoiceBotMicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000; // input samples per output sample
    this.position = 0; // fractional read position into the current input block
    this.previous = 0; // last input sample of the previous block, for interpolation
    this.chunk = new Int16Array(320);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    while (this.position < input.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const current = input[index];
      const before = index === 0 ? this.previous : input[index - 1];
      const value = before + (current - before) * fraction;
      const clipped = Math.max(-1, Math.min(1, value));
      this.chunk[this.filled++] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      if (this.filled === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(320);
        this.filled = 0;
      }
      this.position += this.step;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
    return true;
  }
}

registerProcessor("voice-bot-mic-capture", VoiceBotMicCapture);
