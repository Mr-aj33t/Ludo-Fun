import { COORDINATES_MAP, PLAYERS, STEP_LENGTH } from './constants.js';

const diceButtonElement = document.querySelector('button#dice-btn');
const playerPiecesElements = {
    P1: document.querySelectorAll('[player-id="P1"].player-piece'),
    P2: document.querySelectorAll('[player-id="P2"].player-piece'),
    P3: document.querySelectorAll('[player-id="P3"].player-piece'),
    P4: document.querySelectorAll('[player-id="P4"].player-piece'),
}

const DICE_FACE_PATH = './ludo/assets/dice';

export class UI {
    static _lastDiceValue = 1;
    static _hasAnyRoll = false;

    static _diceRollTimersByPlayer = {
        P1: [],
        P2: [],
        P3: [],
        P4: []
    };

    static getDiceSection(playerId) {
        return document.querySelector(`.player-dice-section[player-id="${playerId}"]`);
    }

    static getDiceButton(playerId) {
        return document.querySelector(`.player-dice[player-id="${playerId}"]`);
    }

    static ensureDiceFaceImage(playerId) {
        const btn = this.getDiceButton(playerId);
        if (!btn) return null;

        let img = btn.querySelector('img.dice-face');
        if (!img) {
            img = document.createElement('img');
            img.className = 'dice-face';
            img.alt = 'Dice';
            btn.appendChild(img);
        }
        return img;
    }

    static ensureSideValueText(playerId) {
        const section = this.getDiceSection(playerId);
        if (!section) return null;

        let el = section.querySelector('span.dice-value-text');
        if (!el) {
            el = document.createElement('span');
            el.className = 'dice-value-text';
            section.appendChild(el);
        }
        return el;
    }

    static setSideValueText(playerId, value) {
        const el = this.ensureSideValueText(playerId);
        if (!el) return;
        if (value === null || value === undefined || value === '') {
            el.textContent = '';
            return;
        }
        el.textContent = String(value);
    }

    static setDiceFace(playerId, value) {
        const img = this.ensureDiceFaceImage(playerId);
        if (!img) return;
        const face = (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) ?
            1 :
            Number(value);
        img.src = `${DICE_FACE_PATH}/${face}.png`;
    }

    static setActiveDiceDisplay(playerId) {
        if (!playerId) return;
        const faceValue = this._hasAnyRoll ? this._lastDiceValue : 1;
        this.setDiceFace(playerId, faceValue);
        this.setSideValueText(playerId, this._hasAnyRoll ? faceValue : '');
    }

    static resetDiceUI() {
        this._lastDiceValue = 1;
        this._hasAnyRoll = false;
        ['P1', 'P2', 'P3', 'P4'].forEach(pid => {
            this.setSideValueText(pid, '');
            this.setDiceFace(pid, 1);
        });
    }

    static cancelDiceAnimation(playerId) {
        const timers = this._diceRollTimersByPlayer[playerId] || [];
        timers.forEach(t => clearTimeout(t));
        this._diceRollTimersByPlayer[playerId] = [];

        const btn = this.getDiceButton(playerId);
        if (btn) {
            btn.classList.remove('dice-rolling');
            btn.style.transform = '';
        }
    }

    static animateDiceRoll(playerId, finalValue) {
        this.cancelDiceAnimation(playerId);

        const btn = this.getDiceButton(playerId);
        const img = this.ensureDiceFaceImage(playerId);
        if (!btn || !img) {
            this.setDiceFace(playerId, finalValue);
            return Promise.resolve(finalValue);
        }

        // Total animation target ~650ms
        // Random faces until ~600ms with gradual slow-down, then settle by ~650ms.
        btn.classList.add('dice-rolling');

        // Hide side value during rolling
        this.setSideValueText(playerId, '');

        // During animation, avoid showing 0-face (keep it 1..6)
        const randomFace = () => (Math.floor(Math.random() * 6) + 1);

        // Sum of delays = 600ms
        const delays = [60, 60, 60, 70, 70, 80, 90, 110];

        return new Promise(resolve => {
            let elapsed = 0;

            // Immediate first face so it feels responsive
            this.setDiceFace(playerId, randomFace());

            delays.forEach((delay) => {
                elapsed += delay;
                const timer = setTimeout(() => {
                    this.setDiceFace(playerId, randomFace());
                }, elapsed);
                this._diceRollTimersByPlayer[playerId].push(timer);
            });

            const lockTimer = setTimeout(() => {
                this.setDiceFace(playerId, finalValue);
                this.setSideValueText(playerId, finalValue);
            }, 600);
            this._diceRollTimersByPlayer[playerId].push(lockTimer);

            const settleTimer = setTimeout(() => {
                btn.classList.remove('dice-rolling');
                btn.style.transform = '';
                resolve(finalValue);
            }, 650);
            this._diceRollTimersByPlayer[playerId].push(settleTimer);
        });
    }

    static listenDiceClick(callback) {
        // Use event delegation to handle dynamically loaded dice buttons
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const diceBtn = target.classList.contains('player-dice') ?
                target :
                target.closest('.player-dice');

            if (!diceBtn) return;

            const playerId = diceBtn.getAttribute('player-id');
            callback(playerId);
        });
    }

    static listenResetClick(callback) {
        document.querySelector('button#reset-btn').addEventListener('click', callback)
    }

    static listenPieceClick(callback) {
        document.querySelector('.player-pieces').addEventListener('click', callback)
    }

    /**
     * 
     * @param {string} player 
     * @param {Number} piece 
     * @param {Number} newPosition 
     */
    static setPiecePosition(player, piece, newPosition) {
        console.log(`Setting ${player} piece ${piece} to position ${newPosition}`);

        if (!playerPiecesElements[player] || !playerPiecesElements[player][piece]) {
            console.error(`Player element of given player: ${player} and piece: ${piece} not found`)
            return;
        }

        const coordinates = COORDINATES_MAP[newPosition];
        if (!coordinates) {
            console.error(`Coordinates not found for position: ${newPosition}`);
            return;
        }

        const [x, y] = coordinates;

        const pieceElement = playerPiecesElements[player][piece];
        pieceElement.dataset.position = String(newPosition);
        pieceElement.style.top = (y * STEP_LENGTH + STEP_LENGTH / 2) + '%';
        pieceElement.style.left = (x * STEP_LENGTH + STEP_LENGTH / 2) + '%';

        // Handle overlapping pieces - bring current player's pieces to front
        this.handleOverlappingPieces(newPosition, player, piece);
    }

    static handleOverlappingPieces(position, currentPlayer, currentPiece) {
        const piecesByPosition = new Map();

        PLAYERS.forEach(player => {
            [0, 1, 2, 3].forEach(piece => {
                if (!playerPiecesElements[player] || !playerPiecesElements[player][piece]) return;
                const element = playerPiecesElements[player][piece];
                const pos = element.dataset.position;
                if (!pos) return;

                const posNum = Number(pos);
                if (!COORDINATES_MAP[posNum]) return;

                if (!piecesByPosition.has(posNum)) {
                    piecesByPosition.set(posNum, []);
                }
                piecesByPosition.get(posNum).push({ player, piece, element });
            });
        });

        PLAYERS.forEach(player => {
            [0, 1, 2, 3].forEach(piece => {
                if (playerPiecesElements[player] && playerPiecesElements[player][piece]) {
                    const element = playerPiecesElements[player][piece];
                    element.classList.remove('overlapped', 'current-turn', 'stacked');
                    element.style.zIndex = '';

                    const indicator = element.querySelector('.position-indicator');
                    if (indicator) {
                        indicator.remove();
                    }

                    const pos = element.dataset.position;
                    if (pos && COORDINATES_MAP[Number(pos)]) {
                        const [x, y] = COORDINATES_MAP[Number(pos)];
                        element.style.top = (y * STEP_LENGTH + STEP_LENGTH / 2) + '%';
                        element.style.left = (x * STEP_LENGTH + STEP_LENGTH / 2) + '%';
                    }
                }
            });
        });

        piecesByPosition.forEach((piecesAtPosition, posNum) => {
            if (piecesAtPosition.length <= 1) return;

            const [x, y] = COORDINATES_MAP[posNum];
            const baseTop = y * STEP_LENGTH + STEP_LENGTH / 2;
            const baseLeft = x * STEP_LENGTH + STEP_LENGTH / 2;
            const count = piecesAtPosition.length;
            const radius = (count === 2) ?
                STEP_LENGTH * 0.22 :
                STEP_LENGTH * 0.26;

            piecesAtPosition.forEach((pieceInfo, index) => {
                const element = pieceInfo.element;
                element.classList.add('stacked');
                const angle = (2 * Math.PI * index) / piecesAtPosition.length;
                const dx = Math.cos(angle) * radius;
                const dy = Math.sin(angle) * radius;

                element.style.top = (baseTop + dy) + '%';
                element.style.left = (baseLeft + dx) + '%';

                if (pieceInfo.player === currentPlayer) {
                    element.style.zIndex = 1000;
                    element.classList.add('current-turn');
                } else {
                    element.style.zIndex = 100 + index;
                    element.classList.add('overlapped');
                }
            });
        });
    }

    static updateCurrentPlayerHighlight(currentPlayer) {
        // Remove current-turn class from all pieces
        PLAYERS.forEach(player => {
            [0, 1, 2, 3].forEach(piece => {
                if (playerPiecesElements[player] && playerPiecesElements[player][piece]) {
                    const element = playerPiecesElements[player][piece];
                    element.classList.remove('current-turn');
                }
            });
        });

        // Add current-turn class to current player's pieces that are eligible
        [0, 1, 2, 3].forEach(piece => {
            if (playerPiecesElements[currentPlayer] && playerPiecesElements[currentPlayer][piece]) {
                const element = playerPiecesElements[currentPlayer][piece];
                if (element.classList.contains('highlight')) {
                    element.classList.add('current-turn');
                    element.style.zIndex = 1000;
                }
            }
        });
    }

    static setTurn(player) {
        // Display player name instead of player ID
        const playerNames = {
            'P1': 'Blue',
            'P2': 'Red',
            'P3': 'Green',
            'P4': 'Yellow'
        };

        const playerName = playerNames[player] || player;
        document.querySelector('.active-player span').innerText = playerName;

        // Highlight current player's base
        document.querySelectorAll('.player-base').forEach(base => {
            base.classList.remove('highlight');
        });
        document.querySelector(`[player-id="${player}"].player-base`).classList.add('highlight');

        this.setActiveDiceDisplay(player);
    }

    static enableDice(playerId) {
        // Disable all dice first
        document.querySelectorAll('.player-dice').forEach(diceBtn => {
            diceBtn.disabled = true;
            diceBtn.parentElement.classList.remove('active');
        });

        // Enable only current player's dice
        const currentPlayerDice = document.querySelector(`.player-dice[player-id="${playerId}"]`);
        if (currentPlayerDice) {
            currentPlayerDice.disabled = false;
            currentPlayerDice.parentElement.classList.add('active');
        }
    }

    static disableAllDice() {
        document.querySelectorAll('.player-dice').forEach(diceBtn => {
            diceBtn.disabled = true;
        });
    }

    static setDiceValue(diceValue, playerId = null) {
        console.log('Setting dice value:', diceValue, 'for player:', playerId);

        if (playerId) {
            if (diceValue !== null && diceValue !== undefined && diceValue !== '' && !Number.isNaN(Number(diceValue))) {
                this._lastDiceValue = Number(diceValue);
                this._hasAnyRoll = true;
            }

            if (['P1', 'P2', 'P3', 'P4'].includes(playerId)) {
                const diceBtn = document.querySelector(`.player-dice[player-id="${playerId}"]`);
                if (diceBtn) {
                    const valueStr = (diceValue === null || diceValue === undefined) ? '' : String(diceValue);
                    diceBtn.setAttribute('data-dice-value', valueStr);
                    diceBtn.setAttribute('data-has-value', valueStr === '' ? '0' : '1');
                }
            }

            this.setDiceFace(playerId, diceValue);
            this.setSideValueText(playerId, diceValue);

            // Set dice value for specific player
            const playerDiceValue = document.querySelector(`.dice-value[player-id="${playerId}"]`);
            console.log('Found dice element:', playerDiceValue);

            if (playerDiceValue) {
                playerDiceValue.innerText = diceValue;
                console.log('Dice value set to:', diceValue);
            }
        } else {
            // Fallback for old dice element if exists
            const diceValueElement = document.querySelector('.dice-value:not([player-id])');
            if (diceValueElement) {
                diceValueElement.innerText = diceValue;
            }
        }
    }

    static highlightPieces(player, pieces) {
        pieces.forEach(piece => {
            const pieceElement = playerPiecesElements[player][piece];
            pieceElement.classList.add('highlight');
        })
    }

    static unhighlightPieces() {
        document.querySelectorAll('.player-piece.highlight').forEach(ele => {
            ele.classList.remove('highlight');
        })
    }

    static showMovementArrows(player, piece) {
        // Remove existing arrows first
        this.hideMovementArrows();

        const pieceElement = playerPiecesElements[player][piece];
        if (!pieceElement) return;

        // Get piece position on screen
        const pieceRect = pieceElement.getBoundingClientRect();

        const arrowsContainer = document.createElement('div');
        arrowsContainer.className = 'movement-arrows';
        arrowsContainer.setAttribute('data-player', player);
        arrowsContainer.setAttribute('data-piece', piece);

        // Position arrows above the piece
        arrowsContainer.style.left = (pieceRect.left + pieceRect.width / 2 - 35) + 'px';
        arrowsContainer.style.top = (pieceRect.top - 40) + 'px';

        // Forward arrow (always available for eligible pieces)
        const forwardArrow = document.createElement('button');
        forwardArrow.className = 'arrow-btn forward';
        forwardArrow.innerHTML = '←';
        forwardArrow.title = 'Move Forward';
        forwardArrow.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Forward arrow clicked!');
            UI.selectMovementDirection(player, piece, 'forward');
        };

        // Backward arrow (only if can cut opponent behind)
        const backwardArrow = document.createElement('button');
        backwardArrow.className = 'arrow-btn backward';
        backwardArrow.innerHTML = '→';
        backwardArrow.title = 'Move Backward to Cut';
        backwardArrow.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Backward arrow clicked!');
            UI.selectMovementDirection(player, piece, 'backward');
        };

        arrowsContainer.appendChild(forwardArrow);
        arrowsContainer.appendChild(backwardArrow);

        // Append to body instead of piece element
        document.body.appendChild(arrowsContainer);
    }

    static hideMovementArrows() {
        document.querySelectorAll('.movement-arrows').forEach(arrows => {
            arrows.remove();
        });
    }

    static selectMovementDirection(player, piece, direction) {
        console.log(`Arrow clicked: ${direction} for ${player} piece ${piece}`);
        this.hideMovementArrows();

        // Trigger movement with selected direction
        const event = {
            target: playerPiecesElements[player][piece],
            movementDirection: direction
        };

        console.log('Calling ludo.onPieceClick with direction:', direction);

        // Call the game's piece click handler
        if (window.ludo) {
            window.ludo.onPieceClick(event);
        } else {
            console.error('window.ludo not found!');
        }
    }
}

// UI.setPiecePosition('P1', 0, 0);
// UI.setTurn('P1');
// UI.setTurn('P2');

// UI.enableDice('P1');
// UI.disableAllDice();
// UI.setDiceValue(5, 'P1');
// UI.highlightPieces('P1', [0]);
// UI.unhighlightPieces();