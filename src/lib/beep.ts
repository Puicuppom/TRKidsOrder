// เสียง beep สั้นๆ ด้วย Web Audio (แทนไฟล์เสียง success/error เดิม)
let ctx: AudioContext | null = null

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine') {
  try {
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + durationMs / 1000)
  } catch {
    /* ไม่รองรับเสียง */
  }
}

export const beepSuccess = () => tone(880, 90)
export const beepError = () => tone(220, 220, 'square')
