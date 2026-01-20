import { Ludo } from './ludo/Ludo.js';
import { Sound } from './ludo/Sound.js';

const ludo = new Ludo();

// Make ludo instance globally available for UI callbacks
window.ludo = ludo;

const soundBtn = document.getElementById('sound-btn');
if (soundBtn) {
    const soundIcon = document.getElementById('sound-icon');
    const updateIcon = () => {
        if (!soundIcon) return;
        const muted = Sound.isMuted();
        soundIcon.src = muted ? './ludo/assets/button/sound-off.png' : './ludo/assets/button/sound-on.png';
        soundIcon.alt = muted ? 'Sound Off' : 'Sound On';
    };
    updateIcon();

    soundBtn.addEventListener('click', () => {
        Sound.unlock();
        Sound.toggleMuted();
        updateIcon();
    });
}