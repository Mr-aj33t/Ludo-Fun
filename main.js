import { Ludo } from './ludo/Ludo.js';
import { Sound } from './ludo/Sound.js';

const ludo = new Ludo();

// Make ludo instance globally available for UI callbacks
window.ludo = ludo;

const soundBtn = document.getElementById('sound-btn');
if (soundBtn) {
    const updateLabel = () => {
        soundBtn.textContent = Sound.isMuted() ? 'Sound: OFF' : 'Sound: ON';
    };
    updateLabel();

    soundBtn.addEventListener('click', () => {
        Sound.unlock();
        Sound.toggleMuted();
        updateLabel();
    });
}