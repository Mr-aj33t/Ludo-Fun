export class Sound {
    static _inited = false;
    static _unlocked = false;
    static _ctx = null;
    static _gain = null;

    static _muted = (() => {
        try {
            const stored = localStorage.getItem('ludo_muted');
            return JSON.parse(stored !== null ? stored : 'false');
        } catch (_) {
            return false;
        }
    })();

    static _volume = (() => {
        const stored = localStorage.getItem('ludo_volume');
        const raw = Number(stored !== null ? stored : '0.8');
        return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.8;
    })();

    static _audioByKey = new Map();
    static _sourcesByKey = new Map();

    static init() {
        if (this._inited) return;
        this._inited = true;

        const sources = {
            dice: './ludo/assets/sfx/dice.mp3',
            move: './ludo/assets/sfx/move.mp3',
            cut: './ludo/assets/sfx/cut.mp3',
            home: './ludo/assets/sfx/home.mp3',
            safe: './ludo/assets/sfx/safe.mp3'
        };

        Object.entries(sources).forEach(([key, src]) => {
            this._sourcesByKey.set(key, src);
        });
    }

    static unlock() {
        this.init();
        if (this._unlocked) return;

        try {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (AudioContextCtor) {
                this._ctx = this._ctx || new AudioContextCtor();
                this._gain = this._gain || this._ctx.createGain();
                this._gain.gain.value = this._muted ? 0 : this._volume;
                this._gain.connect(this._ctx.destination);

                if (this._ctx.state === 'suspended') {
                    this._ctx.resume();
                }

                const o = this._ctx.createOscillator();
                o.frequency.value = 1;
                o.connect(this._gain);
                o.start();
                o.stop(this._ctx.currentTime + 0.01);
            }
        } catch (_) {}

        this._unlocked = true;
    }

    static setMuted(muted) {
        this._muted = !!muted;
        try {
            localStorage.setItem('ludo_muted', JSON.stringify(this._muted));
        } catch (_) {}
        if (this._gain) {
            this._gain.gain.value = this._muted ? 0 : this._volume;
        }
    }

    static toggleMuted() {
        this.setMuted(!this._muted);
        return this._muted;
    }

    static isMuted() {
        return this._muted;
    }

    static setVolume(volume01) {
        const v = Number(volume01);
        this._volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : this._volume;
        try {
            localStorage.setItem('ludo_volume', String(this._volume));
        } catch (_) {}
        if (this._gain) {
            this._gain.gain.value = this._muted ? 0 : this._volume;
        }
    }

    static play(key) {
        this.init();
        if (this._muted) return;

        try {
            const src = this._sourcesByKey.get(key);
            if (!src) {
                this._beep(key);
                return;
            }

            let baseAudio = this._audioByKey.get(key);
            if (!baseAudio) {
                baseAudio = new Audio(src);
                baseAudio.preload = 'none';
                baseAudio.volume = this._volume;
                baseAudio.addEventListener('error', () => {
                    this._audioByKey.delete(key);
                }, { once: true });
                this._audioByKey.set(key, baseAudio);
            }

            const a = baseAudio.cloneNode(true);
            a.volume = this._volume;
            a.play().catch(() => this._beep(key));
        } catch (_) {
            this._beep(key);
        }
    }

    static _beep(key) {
        if (this._muted) return;

        try {
            this.unlock();
            if (!this._ctx) return;

            const ctx = this._ctx;
            const g = ctx.createGain();
            g.gain.value = 0.08 * this._volume;
            g.connect(ctx.destination);

            const o = ctx.createOscillator();
            o.type = 'sine';

            const map = {
                dice: [640, 0.08],
                move: [520, 0.03],
                cut: [220, 0.16],
                home: [880, 0.2],
                safe: [440, 0.1]
            };

            const entry = map[key] || [500, 0.1];
            o.frequency.value = entry[0];

            o.connect(g);
            const t = ctx.currentTime;
            o.start(t);
            o.stop(t + entry[1]);
        } catch (_) {}
    }
}