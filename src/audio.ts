import type { GameState } from './sim'

type Tone = {
  hz: number
  end?: number
  level: number
  duration: number
  attack?: number
  delay?: number
  wave?: OscillatorType
  echo?: boolean
  pan?: number
}

type Loop = {
  source: OscillatorNode | AudioBufferSourceNode
  gain: GainNode
  filter: BiquadFilterNode
}

const floor = 0.0001

/**
 * Synthesizes the score, scene beds and diegetic cues from the live simulation.
 * Browsers only allocate the audio graph after an explicit player gesture.
 */
export class Soundscape {
  private context?: AudioContext
  private master?: GainNode
  private mix?: GainNode
  private echoSend?: GainNode
  private noise?: AudioBuffer
  private wind?: Loop
  private engine?: Loop
  private transmission?: Loop
  private skid?: Loop
  private foundation?: Loop
  private enabled = true
  private volume = 0.68
  private disposed = false
  private lastEvent = -1
  private nextMix = 0
  private nextBeat = 0
  private beat = 0
  private priorMode = 0
  private previousSecond = -1
  private previousExtraction = -1
  private hoverTime = -1
  private eventPan = 0
  private incomingMove = 'sweep'
  private operator = 0
  private lastImpact = 0

  unlock(): void {
    if (this.disposed || typeof window === 'undefined') return
    if (!this.context) {
      const Audio =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Audio) return

      try {
        this.context = new Audio({ latencyHint: 'interactive' })
        this.createGraph(this.context)
        document.addEventListener('visibilitychange', this.applyVolume)
      } catch {
        void this.context?.close().catch(() => {})
        this.context = undefined
        return
      }
    }
    if (this.context.state !== 'running') void this.context.resume().catch(() => {})
  }

  setEnabled(value: boolean): void {
    this.enabled = value
    this.applyVolume()
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return
    this.volume = Math.max(0, Math.min(1, value))
    this.applyVolume()
  }

  private applyVolume = (): void => {
    const ac = this.context
    if (!ac || !this.master) return
    const target = this.enabled && !document.hidden ? this.volume : 0
    this.master.gain.cancelScheduledValues(ac.currentTime)
    this.master.gain.setTargetAtTime(target, ac.currentTime, 0.028)
  }

  private createGraph(ac: AudioContext): void {
    this.mix = ac.createGain()
    const limiter = ac.createDynamicsCompressor()
    limiter.threshold.value = -15
    limiter.knee.value = 12
    limiter.ratio.value = 4
    limiter.attack.value = 0.005
    limiter.release.value = 0.15
    this.master = ac.createGain()
    this.master.gain.value = 0
    this.mix.connect(limiter).connect(this.master).connect(ac.destination)

    // Short, filtered reflections give field machinery and warning calls a location.
    this.echoSend = ac.createGain()
    this.echoSend.gain.value = 0.2
    const delay = ac.createDelay(1)
    delay.delayTime.value = 0.193
    const walls = ac.createBiquadFilter()
    walls.type = 'lowpass'
    walls.frequency.value = 1900
    const feedback = ac.createGain()
    feedback.gain.value = 0.23
    this.echoSend.connect(delay).connect(walls).connect(this.mix)
    walls.connect(feedback).connect(delay)

    const frames = Math.floor(ac.sampleRate * 3.73)
    this.noise = ac.createBuffer(2, frames, ac.sampleRate)
    let seed = 0x183cf7
    for (let channel = 0; channel < 2; channel++) {
      const samples = this.noise.getChannelData(channel)
      for (let frame = 0; frame < frames; frame++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        samples[frame] = seed / 2147483648 - 1
      }
    }

    this.wind = this.loop('noise', 580, 'lowpass', 0.55)
    this.skid = this.loop('noise', 1300, 'bandpass', 0.6)
    this.engine = this.loop('sawtooth', 280, 'lowpass', 0.6)
    this.transmission = this.loop('triangle', 930, 'lowpass', 0.65)
    this.foundation = this.loop('sine', 350, 'lowpass', 0.6)
    this.applyVolume()
  }

  private loop(wave: OscillatorType | 'noise', cutoff: number, type: BiquadFilterType, q: number): Loop {
    const ac = this.context!
    const filter = ac.createBiquadFilter()
    filter.type = type
    filter.frequency.value = cutoff
    filter.Q.value = q
    const gain = ac.createGain()
    gain.gain.value = 0
    const source = wave === 'noise' ? ac.createBufferSource() : ac.createOscillator()
    if ('buffer' in source) {
      source.buffer = this.noise!
      source.loop = true
      source.start(0, wave === 'noise' && type === 'bandpass' ? 1.28 : 0)
    } else {
      source.type = wave as OscillatorType
      source.frequency.value = 45
      source.start()
    }
    source.connect(filter).connect(gain).connect(this.mix!)
    return { source, gain, filter }
  }

  private tone(spec: Tone): void {
    const ac = this.context!
    const at = ac.currentTime + (spec.delay || 0)
    const source = ac.createOscillator()
    source.type = spec.wave || 'sine'
    source.frequency.setValueAtTime(spec.hz, at)
    if (spec.end) source.frequency.exponentialRampToValueAtTime(spec.end, at + spec.duration)
    this.voice(source, at, spec.duration, spec.level, spec.attack ?? 0.004, spec.echo, spec.pan)
  }

  private burst(center: number, end: number, level: number, duration: number, delay = 0, pan = 0): void {
    const ac = this.context!
    const at = ac.currentTime + delay
    const source = ac.createBufferSource()
    source.buffer = this.noise!
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 0.65
    filter.frequency.setValueAtTime(center, at)
    filter.frequency.exponentialRampToValueAtTime(end, at + duration)
    this.voice(source, at, duration, level, 0.004, false, pan, filter)
  }

  private voice(
    source: OscillatorNode | AudioBufferSourceNode,
    at: number,
    duration: number,
    level: number,
    attack: number,
    echo = false,
    pan = 0,
    filter?: AudioNode,
  ): void {
    const ac = this.context!
    const gain = ac.createGain()
    gain.gain.setValueAtTime(floor, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(level, floor), at + Math.min(attack, duration * 0.65))
    gain.gain.exponentialRampToValueAtTime(floor, at + duration)
    if (filter) source.connect(filter).connect(gain)
    else source.connect(gain)
    const panner = pan && ac.createStereoPanner ? ac.createStereoPanner() : undefined
    if (panner) {
      panner.pan.value = pan
      gain.connect(panner)
    }
    const last = panner || gain
    last.connect(this.mix!)
    if (echo) last.connect(this.echoSend!)
    source.onended = () => {
      source.disconnect()
      filter?.disconnect()
      gain.disconnect()
      panner?.disconnect()
    }
    if ('buffer' in source) source.start(at, (at * 0.73) % 2)
    else source.start(at)
    source.stop(at + duration + 0.025)
  }

  private running(): boolean {
    return (
      this.enabled &&
      this.volume > 0 &&
      !this.disposed &&
      this.context?.state === 'running' &&
      !document.hidden
    )
  }

  play(name: string): void {
    if (!this.running()) return
    const now = this.context!.currentTime
    const pan = this.eventPan
    switch (name) {
      case 'hover':
        if (now - this.hoverTime < 0.1) return
        this.hoverTime = now
        this.tone({ hz: 1190, end: 1070, duration: 0.024, level: 0.018 })
        break
      case 'click':
      case 'ui':
      case 'cancel':
        this.burst(2400, 780, 0.09, 0.032)
        this.tone({ hz: 410, end: 268, duration: 0.055, level: 0.055, wave: 'triangle' })
        break
      case 'mode':
      case 'switch':
        this.burst(450, 3100, 0.14, 0.14, 0, -0.4)
        this.tone({
          hz: 246.94,
          end: 369.99,
          duration: 0.16,
          level: 0.068,
          wave: 'triangle',
          pan: 0.3,
          echo: true,
        })
        break
      case 'start':
      case 'raid':
        this.tone({ hz: 73.42, end: 55, duration: 1.0, level: 0.19, attack: 0.04 })
        this.tone({ hz: 220, end: 164.81, duration: 0.65, level: 0.055, wave: 'triangle', echo: true })
        this.burst(2100, 220, 0.24, 0.44)
        break
      case 'build':
      case 'power':
        this.tone({ hz: 131, end: 67, duration: 0.23, level: 0.19, wave: 'triangle' })
        this.burst(510, 190, 0.27, 0.19)
        this.tone({ hz: 659.25, duration: 0.12, delay: 0.14, level: 0.072, echo: true })
        break
      case 'salvage':
      case 'confirm':
      case 'upgrade':
        this.burst(2100, 990, 0.08, 0.052)
        this.tone({ hz: 493.88, duration: 0.18, level: 0.073, wave: 'triangle' })
        this.tone({ hz: 739.99, duration: 0.3, delay: 0.075, level: 0.05, echo: true })
        break
      case 'attack':
        this.burst([480, 1100, 290][this.operator], 3100, 0.33, 0.14, 0, -0.16)
        this.tone({
          hz: [300, 493.88, 130.81][this.operator],
          end: 67,
          duration: 0.11,
          level: 0.14,
          wave: 'triangle',
        })
        break
      case 'hit':
        this.burst(3100, 240, 0.45, 0.14, 0, pan)
        this.tone({ hz: 136, end: 39, duration: 0.22, level: 0.29, pan })
        break
      case 'hurt':
        this.burst(1100, 90, 0.52, 0.3)
        this.tone({ hz: 85, end: 31, duration: 0.4, level: 0.28, wave: 'triangle' })
        break
      case 'parry':
      case 'resonance':
        this.burst(5200, 550, 0.43, 0.24)
        this.tone({ hz: 183.5, end: 44, duration: 0.27, level: 0.27 })
        this.tone({ hz: 1318, end: 1108, duration: 0.5, level: 0.15, pan: -0.25, echo: true })
        this.tone({ hz: 1913, end: 1662, duration: 0.37, delay: 0.028, level: 0.07, pan: 0.25 })
        break
      case 'warning': {
        // Rising sweep, descending hammer and a stuttering charge have distinct tells.
        const hammer = this.incomingMove === 'slam'
        const charge = this.incomingMove === 'lunge'
        this.tone({
          hz: hammer ? 185 : 123.47,
          end: hammer ? 68 : 196,
          duration: 0.33,
          level: 0.15,
          wave: 'triangle',
          attack: 0.065,
          pan,
          echo: true,
        })
        this.tone({
          hz: charge ? 369.99 : 246.94,
          end: hammer ? 123.47 : 293.66,
          duration: charge ? 0.1 : 0.22,
          level: 0.082,
          delay: 0.09,
          pan,
        })
        if (charge) this.tone({ hz: 415.3, duration: 0.1, level: 0.09, delay: 0.22, pan })
        break
      }
      case 'dodge':
        this.burst(2500, 390, 0.33, 0.21, 0, -0.3)
        break
      case 'finish':
        this.burst(3900, 130, 0.62, 0.43)
        this.tone({ hz: 150, end: 32, duration: 1.0, level: 0.35, echo: true })
        this.tone({ hz: 1174.7, end: 370, duration: 1.05, level: 0.13, delay: 0.05, echo: true })
        break
      case 'extract':
        this.tone({ hz: 369.99, duration: 0.16, level: 0.13, wave: 'triangle' })
        this.tone({ hz: 554.37, duration: 0.22, level: 0.1, delay: 0.14, echo: true })
        break
      case 'success': {
        const recoveryChord = [220, 329.63, 440, 554.37]
        recoveryChord.forEach((hz, i) => {
          this.tone({ hz, duration: 0.83, level: 0.13 - i * 0.018, delay: i * 0.1, echo: true })
        })
        break
      }
      case 'failure':
      case 'error':
        this.tone({ hz: 154, end: 93, duration: 0.26, level: 0.12, wave: 'triangle' })
        this.burst(700, 240, 0.12, 0.11)
        break
      case 'weather':
        this.burst(2800, 400, 0.06, 0.85, 0, -0.55)
        break
    }
  }

  update(_dt: number, state: GameState): void {
    // Consume the latest event even while muted so re-enabling never replays old combat.
    const events = state.events
    if (this.lastEvent < 0) this.lastEvent = state.event.id
    if (this.running() && this.lastEvent < state.event.id) {
      this.eventPan = Math.max(-0.7, Math.min(0.7, (state.boss.x - state.party.x) / 24))
      this.incomingMove = state.boss.move
      this.operator = state.party.active
      for (const event of events) {
        if (event.id > this.lastEvent) this.play(event.type)
      }
    }
    this.lastEvent = state.event.id
    if (!this.running()) return
    const ac = this.context!
    const now = ac.currentTime
    if (now < this.nextMix) return
    this.nextMix = now + 0.05

    const mode = state.mode
    const speed = Math.min(1, Math.abs(state.rover.speed) / 17)
    const gust = (Math.sin(now * 0.34) + 0.55 * Math.sin(now * 0.13 + 1)) * 0.5
    const roughWeather = /wind|dust|storm|rain|gale/i.test(String(state.weather))
    const drive = mode === 1 || mode === 2
    const tension = mode === 4 && state.raid.active && state.boss.stage !== 'dead'
    const machine = mode === 3
    const shift = (parameter: AudioParam, target: number, smoothing = 0.18) =>
      parameter.setTargetAtTime(target, now, smoothing)
    const tune = (loop: Loop, hz: number) => shift((loop.source as OscillatorNode).frequency, hz)

    shift(this.wind!.gain.gain, (roughWeather ? 0.16 : 0.086) + gust * 0.02, 0.6)
    shift(this.wind!.filter.frequency, (tension ? 370 : 580) + 180 * gust + 460 * speed)
    shift(this.engine!.gain.gain, drive ? 0.038 + 0.088 * speed : machine ? 0.018 : 0)
    tune(this.engine!, 30 + 68 * speed + 1.8 * Math.sin(now * 8))
    shift(this.engine!.filter.frequency, 150 + speed * 520)
    shift(this.transmission!.gain.gain, drive ? 0.028 * speed : machine && state.power.used > 0 ? 0.018 : 0)
    tune(this.transmission!, machine ? 98 : 86 + 172 * speed)
    shift(this.skid!.gain.gain, drive ? 0.34 * state.rover.drift * speed : 0, 0.055)
    shift(this.skid!.filter.frequency, 880 + speed * 1200)
    shift(this.foundation!.gain.gain, tension ? 0.078 : 0.041, 0.6)
    tune(this.foundation!, tension ? 36.71 : machine ? 49 : 55)
    if (drive && !state.raid.active && state.fx.shake - this.lastImpact > 0.15) {
      this.burst(1400, 160, 0.31, 0.18)
      this.tone({ hz: 92, end: 47, level: 0.19, duration: 0.2, wave: 'triangle' })
    }
    this.lastImpact = state.fx.shake

    if (mode !== this.priorMode) {
      this.priorMode = mode
      this.nextBeat = now + 0.45
      this.beat = 0
    }
    if (now >= this.nextBeat) {
      this.score(mode, tension, state.boss.phase, machine && state.power.used > 0)
    }
    const second = Math.ceil(state.raid.timeLeft)
    if (state.raid.active && second > 0 && second <= 12 && second !== this.previousSecond) {
      this.tone({ hz: second <= 4 ? 830.6 : 554.37, duration: 0.095, level: 0.11, wave: 'triangle' })
    }
    this.previousSecond = second
    const extraction = Math.ceil(state.raid.extraction)
    if (state.raid.active && extraction > 0 && extraction !== this.previousExtraction) {
      this.tone({ hz: 659.25, duration: 0.09, level: 0.1, echo: true })
    }
    this.previousExtraction = extraction
  }

  private score(mode: number, tension: boolean, phase: number, powered: boolean): void {
    const now = this.context!.currentTime
    const step = this.beat++ % 8
    if (tension) {
      this.nextBeat = now + (phase >= 2 ? 0.41 : 0.54)
      if (step % 2 === 0 || phase >= 2) {
        this.tone({ hz: step === 0 ? 73.42 : 55, end: 37, level: step === 0 ? 0.17 : 0.092, duration: 0.24 })
      }
      if (step === 3 || step === 6) this.burst(2000, 620, 0.105, 0.084, 0, step === 3 ? 0.52 : -0.52)
      return
    }
    if (mode === 3 && powered) {
      this.nextBeat = now + 0.84
      if (step % 2 === 0) this.burst(1100, 390, 0.074, 0.08, 0, step === 0 ? -0.48 : 0.28)
      if (step === 5) this.tone({ hz: 196, end: 185, level: 0.04, duration: 0.5, echo: true })
      return
    }
    this.nextBeat = now + (mode === 2 ? 1.55 : 2.28)
    const notes = [220, 0, 329.63, 0, 246.94, 196, 0, 0]
    const hz = notes[step]
    if (hz)
      this.tone({
        hz,
        end: hz * 0.998,
        duration: 1.84,
        attack: 0.25,
        level: 0.028,
        pan: Math.sin(step) * 0.56,
        echo: true,
      })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.applyVolume)
    for (const loop of [this.wind, this.skid, this.engine, this.transmission, this.foundation]) {
      if (loop) {
        loop.source.stop()
        loop.source.disconnect()
        loop.filter.disconnect()
        loop.gain.disconnect()
      }
    }
    void this.context?.close().catch(() => {})
    this.context = undefined
  }
}
