import type { AudioContext, AudioNode } from 'react-native-audio-api';

/** Web master recorder using MediaRecorder on the underlying browser context. */
export class MasterRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private dest: MediaStreamAudioDestinationNode | null = null;
  mime = 'audio/webm';
  ext = 'webm';

  constructor(
    private ctx: AudioContext,
    private tap: AudioNode,
  ) {}

  start() {
    const raw = (this.ctx as unknown as { context: globalThis.AudioContext }).context;
    const node = (this.tap as unknown as { node: globalThis.AudioNode }).node;
    this.dest = raw.createMediaStreamDestination();
    node.connect(this.dest);
    const preferred = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
    const mime = preferred.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    this.mime = mime.split(';')[0] || 'audio/webm';
    this.ext = this.mime.includes('mp4') ? 'm4a' : 'webm';
    this.chunks = [];
    this.rec = new MediaRecorder(this.dest.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const node = (this.tap as unknown as { node: globalThis.AudioNode }).node;
        try {
          if (this.dest) node.disconnect(this.dest);
        } catch {}
        this.rec = null;
        resolve(new Blob(this.chunks, { type: this.mime }));
      };
      rec.stop();
    });
  }
}
