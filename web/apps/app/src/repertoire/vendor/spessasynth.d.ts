export class WorkletSynthesizer {
  constructor(context: BaseAudioContext, config?: { oneOutput?: boolean })
  readonly isReady: Promise<unknown>
  readonly soundBankManager: { addSoundBank(buffer: ArrayBuffer, id: string): Promise<void> }
  connect(destinationNode: AudioNode): AudioNode
  programChange(channel: number, programNumber: number, options?: { time: number }): void
  noteOn(channel: number, midiNote: number, velocity: number, options?: { time: number }): void
  noteOff(channel: number, midiNote: number, options?: { time: number }): void
  stopAll(force?: boolean): void
  destroy(): void
}
