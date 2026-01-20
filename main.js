import { Ludo } from './ludo/Ludo.js';

const ludo = new Ludo();

// Make ludo instance globally available for UI callbacks
window.ludo = ludo;