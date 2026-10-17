import type { AudioContext, AudioNode, WorkletNode } from 'react-native-audio-api';
import { scheduleOnRN } from 'react-native-worklets';
import { encodeWav } from './wav';

/**
 * Native master recorder: a worklet node taps the post-limiter master bus
 * and the PCM is assembled into a 16-bit WAV in JS when recording stops.
 */
export class MasterRecorder {
  private left: Float32Array[] = [];
  private right: Float32Array[] = [];
  private node: WorkletNode | null = null;
  private sink: AudioNode | null = null;
  readonly mime = 'audio/wav';
  readonly ext = 'wav';

  constructor(
    private ctx: AudioContext,
    private tap: AudioNode,
  ) {}

  start() {
    this.left = [];
    this.right = [];
    const push = (l: number[], r: number[]) => {
      this.left.push(Float32Array.from(l));
      this.right.push(Float32Array.from(r));
    };
    const callback = (audioData: Array<Float32Array>, channelCount: number) => {
      'worklet';
      scheduleOnRN(push, Array.from(audioData[0]), Array.from(audioData[channelCount > 1 ? 1 : 0]));
    };
    this.node = this.ctx.createWorkletNode(callback, 4096, 2, 'UIRuntime');
    this.tap.connect(this.node);
    try {
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      this.node.connect(mute);
      mute.connect(this.ctx.destination);
      this.sink = mute;
    } catch {
      // sink-only node: nothing to pull through
    }
  }

  async stop(): Promise<ArrayBuffer | null> {
    if (!this.node) return null;
    try {
      this.tap.disconnect(this.node);
    } catch {}
    try {
      this.node.disconnect();
      this.sink?.disconnect();
    } catch {}
    this.node = null;
    this.sink = null;
    return encodeWav([concat(this.left), concat(this.right)], this.ctx.sampleRate);
  }
}

function concat(chunks: Float32Array[]) {
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
