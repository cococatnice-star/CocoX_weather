// MP3 player for Warnings (the real siren sound)
export class WarningSoundAudio {
  private audio: HTMLAudioElement | null = null;

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio("/warning-siren.mp3");
      this.audio.loop = false;
    }
    return this.audio;
  }

  play() {
    const a = this.getAudio();
    a.currentTime = 0;
    a.play().catch(() => {
      // Browser may block autoplay before user interaction
    });
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }
}

// MP4 audio for Watches
export class SirenAudio {
  private audio: HTMLAudioElement | null = null;

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio("/watch-alert.mp4");
      this.audio.loop = false;
    }
    return this.audio;
  }

  play() {
    const a = this.getAudio();
    a.currentTime = 0;
    a.play().catch(() => {
      // Browser may block autoplay before user interaction
    });
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }
}

export const warningSoundAudio = new WarningSoundAudio();
export const sirenAudio = new SirenAudio();
