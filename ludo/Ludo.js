import { BASE_POSITIONS, HOME_ENTRANCE, HOME_POSITIONS, PLAYERS, SAFE_POSITIONS, START_POSITIONS, STATE, TURNING_POINTS } from './constants.js';
import { UI } from './UI.js';
import { Sound } from './Sound.js';

const MOVE_STEP_MS = 260;
const TURN_DICE_TRANSFER_DELAY_MS = 850;

export class Ludo {
    _turnSwitchTimer = null;
    _lastMoveSoundAtMs = 0;

    currentPositions = {
        P1: [],
        P2: [],
        P3: [],
        P4: []
    }

    // Track if player rolled 6 in previous turn (forces forward movement)
    lastRollWasSix = false;

    _diceValue;
    get diceValue() {
        return this._diceValue;
    }
    set diceValue(value) {
        this._diceValue = value;

        UI.setDiceValue(value);
    }

    _turn;
    get turn() {
        return this._turn;
    }
    set turn(value) {
        this._turn = value;
        const currentPlayer = PLAYERS[value];
        UI.setTurn(currentPlayer);
    }

    _state;
    get state() {
        return this._state;
    }
    set state(value) {
        this._state = value;

        if (value === STATE.DICE_NOT_ROLLED) {
            const currentPlayer = PLAYERS[this.turn];
            UI.enableDice(currentPlayer);
            UI.unhighlightPieces();
        } else {
            UI.disableAllDice();
        }
    }

    // Track dice roll count for each player
    diceRollCount = {
        P1: 0,
        P2: 0,
        P3: 0,
        P4: 0
    }

    constructor() {
        console.log('Hello from Ludo!');

        this.currentPositions = {
            P1: [500, 501, 502, 503],
            P2: [600, 601, 602, 603],
            P3: [700, 701, 702, 703],
            P4: [800, 801, 802, 803],
        }

        this.diceValue;
        this.turn = 0;
        this.state = STATE.DICE_NOT_ROLLED;
        this.lastRollWasSix = false;

        this.init();
    }

    init() {
        console.log('Initializing game...');
        this.listenPieceClick();
        this.listenDiceClick();
        this.listenResetClick();

        this.resetGame();

        // Enable dice for first player (P1)
        const currentPlayer = PLAYERS[this.turn];
        UI.setTurn(currentPlayer);
        UI.enableDice(currentPlayer);
    }

    listenDiceClick() {
        UI.listenDiceClick(this.onDiceClick.bind(this))
    }

    onDiceClick(playerId) {
        console.log('dice clicked!', playerId);

        // Only allow current player to roll dice
        if (playerId !== PLAYERS[this.turn]) {
            console.log('Not your turn!', playerId, 'vs', PLAYERS[this.turn]);
            return;
        }

        // Only allow dice click if dice not rolled yet
        if (this.state !== STATE.DICE_NOT_ROLLED) {
            console.log('Dice already rolled!');
            return;
        }

        Sound.unlock();
        Sound.play('dice');

        // Increment roll count for current player
        this.diceRollCount[playerId]++;

        // Generate final dice value with 6-guarantee algorithm
        let finalDiceValue;
        if (this.diceRollCount[playerId] >= 7 && !this.hasOpenTokens(playerId)) {
            // Force a 6 if player has rolled 7+ times without getting 6 and has no open tokens
            finalDiceValue = 6;
            this.diceRollCount[playerId] = 0; // Reset counter
            console.log('Forced 6 for player:', playerId);
        } else {
            // Normal random roll (0-6)
            const randomValue = Math.random();
            finalDiceValue = Math.floor(randomValue * 7);

            // Reset counter if got 6 naturally
            if (finalDiceValue === 6) {
                this.diceRollCount[playerId] = 0;
            }
        }

        // Disable dice buttons while animating
        this.state = STATE.DICE_ROLLED;

        UI.animateDiceRoll(playerId, finalDiceValue).then(() => {
            this._diceValue = finalDiceValue;
            console.log('Final dice value:', finalDiceValue, 'for player:', playerId, 'Roll count:', this.diceRollCount[playerId]);

            UI.setDiceValue(this.diceValue, playerId);

            // Track if this roll is 6 for next turn's movement restrictions
            this.lastRollWasSix = (this.diceValue === 6);

            this.checkForEligiblePieces();
        });
    }

    playLandingSound(player, piece, kill = false) {
        const pos = this.currentPositions[player][piece];
        if (pos === HOME_POSITIONS[player]) {
            Sound.play('home');
            return;
        }
        if (!kill && SAFE_POSITIONS.includes(pos)) {
            Sound.play('safe');
        }
    }

    checkForEligiblePieces() {
        const player = PLAYERS[this.turn];

        console.log(`Checking eligible pieces for ${player}, dice value: ${this.diceValue}`);

        // If dice value is 0, no movement and no extra turn
        if (this.diceValue === 0) {
            console.log(`Dice value 0 - incrementing turn from ${player}`);
            this.incrementTurn();
            return;
        }

        // eligible pieces of given player
        const eligiblePieces = this.getEligiblePieces(player);
        const backwardPieces = this.getEligibleBackwardPieces(player);

        console.log(`${player} eligible pieces:`, eligiblePieces, 'backward pieces:', backwardPieces);

        if (eligiblePieces.length || backwardPieces.length) {
            // highlight the pieces
            UI.highlightPieces(player, [...eligiblePieces, ...backwardPieces]);
            // Update current player highlighting for overlapping pieces
            UI.updateCurrentPlayerHighlight(player);

            this.tryAutoMoveSingleOpenPiece(player, eligiblePieces, backwardPieces);
        } else {
            console.log(`No eligible pieces for ${player} - incrementing turn`);
            this.incrementTurn();
        }
    }

    tryAutoMoveSingleOpenPiece(player, eligiblePieces, backwardPieces) {
        if (this.diceValue === 0 || this.diceValue === 6) return;
        if (backwardPieces.length) return;
        if (eligiblePieces.length !== 1) return;

        const openPieces = [0, 1, 2, 3].filter(piece => {
            const pos = this.currentPositions[player][piece];
            return !BASE_POSITIONS[player].includes(pos) && pos !== HOME_POSITIONS[player];
        });

        if (openPieces.length !== 1) return;

        const piece = eligiblePieces[0];
        if (piece !== openPieces[0]) return;

        setTimeout(() => {
            if (this.state !== STATE.DICE_ROLLED) return;
            this.executeMovement(player, piece, 'forward');
        }, 0);
    }

    incrementTurn() {
        // Brief pause so the current player can see the rolled value before it transfers
        if (this._turnSwitchTimer) {
            clearTimeout(this._turnSwitchTimer);
            this._turnSwitchTimer = null;
        }

        // Lock dice during the handover delay (prevents extra clicks)
        this.state = STATE.DICE_ROLLED;

        const nextTurn = (this.turn + 1) % 4; // Cycle through 0, 1, 2, 3 for 4 players
        this._turnSwitchTimer = setTimeout(() => {
            this.turn = nextTurn;
            this.state = STATE.DICE_NOT_ROLLED;
            this.lastRollWasSix = false;
        }, TURN_DICE_TRANSFER_DELAY_MS);
    }

    getEligiblePieces(player) {
        return [0, 1, 2, 3].filter(piece => {
            const currentPosition = this.currentPositions[player][piece];

            console.log(`Checking ${player} piece ${piece} at position ${currentPosition}`);

            if (currentPosition === HOME_POSITIONS[player]) {
                console.log(`${player} piece ${piece} is at home - not eligible`);
                return false;
            }

            // Tokens can only open from base with a 6
            if (BASE_POSITIONS[player].includes(currentPosition) && this.diceValue !== 6) {
                console.log(`${player} piece ${piece} in base, dice ${this.diceValue} - not eligible`);
                return false;
            }

            // Check if token can move forward without overshooting home
            if (HOME_ENTRANCE[player].includes(currentPosition) &&
                this.diceValue > HOME_POSITIONS[player] - currentPosition) {
                console.log(`${player} piece ${piece} would overshoot home - not eligible`);
                return false;
            }

            console.log(`${player} piece ${piece} is eligible for forward movement`);
            return true;
        });
    }

    getEligibleBackwardPieces(player) {
        // No backward movement allowed after rolling 6
        if (this.lastRollWasSix) {
            console.log(`${player} rolled 6 last - no backward movement allowed`);
            return [];
        }

        // Only allow backward movement for dice values 1-5
        if (this.diceValue === 0 || this.diceValue === 6) {
            return [];
        }

        return [0, 1, 2, 3].filter(piece => {
            const currentPosition = this.currentPositions[player][piece];

            // Skip pieces in base or at home
            if (BASE_POSITIONS[player].includes(currentPosition) ||
                currentPosition === HOME_POSITIONS[player]) {
                return false;
            }

            // Additional check: Don't allow backward movement from starting position
            if (currentPosition === START_POSITIONS[player]) {
                console.log(`${player} piece ${piece} at starting position - no backward movement allowed`);
                return false;
            }

            // Check if there's an opponent behind within cutting range and movement is valid
            return this.canCutOpponentBehind(player, piece);
        });
    }

    canCutOpponentBehind(player, piece) {
        const currentPosition = this.currentPositions[player][piece];
        const playerStartPosition = START_POSITIONS[player];

        // Check if backward movement would cross or go behind player's starting position
        const backwardPosition = this.getBackwardPosition(currentPosition, this.diceValue);

        // Prevent backward movement that would go behind starting position
        if (this.wouldCrossBehindStartPosition(currentPosition, backwardPosition, playerStartPosition)) {
            console.log(`${player} piece ${piece} cannot move backward - would cross behind starting position ${playerStartPosition}`);
            return false;
        }

        // Check all opponents at this exact backward position
        for (let opponent of PLAYERS) {
            if (opponent === player) continue;

            for (let opponentPiece = 0; opponentPiece < 4; opponentPiece++) {
                const opponentPos = this.currentPositions[opponent][opponentPiece];

                if (opponentPos === backwardPosition &&
                    !SAFE_POSITIONS.includes(backwardPosition)) {
                    console.log(`${player} piece ${piece} can cut ${opponent} by moving back ${this.diceValue} steps`);
                    return true;
                }
            }
        }
        return false;
    }

    wouldCrossBehindStartPosition(currentPosition, backwardPosition, playerStartPosition) {
        // Handle circular board wrapping (0-51)
        if (currentPosition > playerStartPosition) {
            // Token is ahead of start position
            // Check if backward movement would wrap around and go behind start position
            if (backwardPosition < playerStartPosition) {
                return true;
            }
        } else if (currentPosition < playerStartPosition) {
            // Token is behind start position - cannot move further backward
            return true;
        }

        // If current position equals start position, allow backward movement
        // as long as it doesn't go too far back
        if (currentPosition === playerStartPosition) {
            return false; // Allow backward from exact start position
        }

        return false;
    }

    getBackwardPosition(currentPos, steps) {
        let position = currentPos;
        for (let i = 0; i < steps; i++) {
            if (position === 0) {
                position = 51;
            } else {
                position--;
            }
        }
        return position;
    }

    listenResetClick() {
        UI.listenResetClick(this.resetGame.bind(this))
    }

    resetGame() {
        console.log('Resetting game...');

        this.currentPositions = {
            P1: [500, 501, 502, 503],
            P2: [600, 601, 602, 603],
            P3: [700, 701, 702, 703],
            P4: [800, 801, 802, 803],
        }

        this.diceValue = undefined;
        this.turn = 0;
        this.state = STATE.DICE_NOT_ROLLED;
        this.lastRollWasSix = false;

        PLAYERS.forEach(player => {
            [0, 1, 2, 3].forEach(piece => {
                this.setPiecePosition(player, piece, this.currentPositions[player][piece]);
            })
        })

        // Clear all dice values
        PLAYERS.forEach(player => {
            UI.setDiceValue('', player);
        });

        UI.resetDiceUI();

        const currentPlayer = PLAYERS[this.turn];
        UI.setTurn(currentPlayer);
        UI.enableDice(currentPlayer);
        UI.unhighlightPieces();
    }

    listenPieceClick() {
        UI.listenPieceClick(this.onPieceClick.bind(this));
    }

    onPieceClick(event) {
        const target = event.target;

        console.log('Piece click event received:', event);
        console.log('Movement direction:', event.movementDirection);

        if (!target.classList.contains('player-piece') || this.state !== STATE.DICE_ROLLED) {
            console.log('Invalid piece click - not player-piece or wrong state:', this.state);
            return;
        }

        const player = target.getAttribute('player-id');
        const piece = parseInt(target.getAttribute('piece'));

        // Only allow current player to move their own pieces
        if (player !== PLAYERS[this.turn]) {
            console.log('Not your piece! Current turn:', PLAYERS[this.turn], 'Clicked piece:', player);
            return;
        }

        console.log(`${player} piece ${piece} clicked`);

        const currentPosition = this.currentPositions[player][piece];

        // Check if piece is eligible for movement
        if (this.isEligiblePiece(player, piece)) {
            const canMoveForward = true; // Always can move forward if eligible
            const canMoveBackward = this.canCutOpponentBehind(player, piece) && !this.lastRollWasSix;

            console.log(`Movement options - Forward: ${canMoveForward}, Backward: ${canMoveBackward}`);

            // If both directions available and no direction specified, show arrows for selection
            if (canMoveForward && canMoveBackward && !event.movementDirection) {
                console.log('Showing movement arrows for direction selection');
                UI.showMovementArrows(player, piece);
                return; // Wait for direction selection
            }

            // If movement direction is specified (from arrow click) or only one option available
            const movementDirection = event.movementDirection || 'forward';
            console.log('Selected movement direction:', movementDirection);

            this.executeMovement(player, piece, movementDirection);
        }
    }

    executeMovement(player, piece, direction) {
        console.log(`Executing ${direction} movement for ${player} piece ${piece}`);

        const currentPosition = this.currentPositions[player][piece];

        // Check if this is backward movement
        const isBackwardMove = (direction === 'backward');

        if (isBackwardMove) {
            console.log(`Moving ${player} piece ${piece} backward ${this.diceValue} steps`);
            // Use backward movement animation
            this.movePieceBackward(player, piece, this.diceValue);
        } else {
            console.log(`Moving ${player} piece ${piece} forward ${this.diceValue} steps`);
            // Use forward movement animation
            this.movePieceAnimated(player, piece, this.diceValue);
        }

        this.state = STATE.DICE_NOT_ROLLED;

        // For base opening (direct movement), handle turn logic immediately
        if (BASE_POSITIONS[player].includes(currentPosition) && this.diceValue === 6) {
            // Update position immediately for base opening
            this.currentPositions[player][piece] = START_POSITIONS[player];

            // Handle turn logic immediately without setTimeout
            const kill = this.checkForKill(player, piece);
            this.playLandingSound(player, piece, kill);
            if (!kill && this.diceValue !== 6) {
                this.incrementTurn();
            } else {
                this.state = STATE.DICE_NOT_ROLLED;
            }
        } else {
            // For normal movement, wait for animation to complete
            setTimeout(() => {
                const kill = this.checkForKill(player, piece);

                if (direction !== 'backward') {
                    this.playLandingSound(player, piece, kill);
                }

                // If no kill and dice value is not 6, change turn
                if (!kill && this.diceValue !== 6) {
                    this.incrementTurn();
                } else {
                    // Same player continues - enable their dice again
                    this.state = STATE.DICE_NOT_ROLLED;
                }
            }, this.diceValue * MOVE_STEP_MS + 120);
        }

        UI.unhighlightPieces();
        UI.hideMovementArrows();
    }

    playMoveTickSound() {
        const now = Date.now();
        // Prevent rapid overlapping sound when multiple things update quickly
        if (now - this._lastMoveSoundAtMs < 80) return;
        this._lastMoveSoundAtMs = now;
        Sound.play('move');
    }

    setPiecePosition(player, piece, newPosition) {
        this.currentPositions[player][piece] = newPosition;
        UI.setPiecePosition(player, piece, newPosition)
    }

    movePiece(player, piece, moveBy) {
        // this.setPiecePosition(player, piece, this.currentPositions[player][piece] + moveBy)
        const interval = setInterval(() => {
            this.incrementPiecePosition(player, piece);
            moveBy--;

            if (moveBy === 0) {
                clearInterval(interval);

                // check if player won
                if (this.hasPlayerWon(player)) {
                    alert(`Player: ${player} has won!`);
                    this.resetGame();
                    return;
                }

                const isKill = this.checkForKill(player, piece);

                if (isKill || this.diceValue === 6) {
                    this.state = STATE.DICE_NOT_ROLLED;
                    return;
                }

                this.incrementTurn();
            }
        }, MOVE_STEP_MS);
    }

    movePieceBackward(player, piece, moveBy) {
        console.log(`Starting backward movement: ${player} piece ${piece}, ${moveBy} steps`);

        const interval = setInterval(() => {
            this.decrementPiecePosition(player, piece);
            this.playMoveTickSound();
            moveBy--;
            console.log(`Backward step completed, remaining: ${moveBy}`);

            if (moveBy === 0) {
                clearInterval(interval);
                console.log(`Backward movement completed for ${player} piece ${piece}`);

                // check if player won
                if (this.hasPlayerWon(player)) {
                    alert(`Player: ${player} has won!`);
                    this.resetGame();
                    return;
                }

                const isKill = this.checkForKill(player, piece);
                console.log(`Backward movement kill check: ${isKill}`);

                this.playLandingSound(player, piece, isKill);

                if (isKill || this.diceValue === 6) {
                    this.state = STATE.DICE_NOT_ROLLED;
                    return;
                }

                this.incrementTurn();
            }
        }, MOVE_STEP_MS);
    }

    movePieceAnimated(player, piece, moveBy) {
        const currentPosition = this.currentPositions[player][piece];

        // If token is opening from base with 6, move directly to start position
        if (BASE_POSITIONS[player].includes(currentPosition) && this.diceValue === 6) {
            this.setPiecePosition(player, piece, START_POSITIONS[player]);
            return;
        }

        // Normal step-by-step movement
        const interval = setInterval(() => {
            this.incrementPiecePosition(player, piece);
            this.playMoveTickSound();
            moveBy--;

            if (moveBy === 0) {
                clearInterval(interval);
            }
        }, MOVE_STEP_MS);
    }

    checkForKill(player, piece) {
        const currentPosition = this.currentPositions[player][piece];
        let kill = false;
        let playedCutSound = false;

        // Check against all other players
        PLAYERS.forEach(opponent => {
            if (opponent === player) return; // Skip same player

            [0, 1, 2, 3].forEach(opponentPiece => {
                const opponentPosition = this.currentPositions[opponent][opponentPiece];

                // Standard killing on regular board (not in safe positions)
                if (currentPosition === opponentPosition && !SAFE_POSITIONS.includes(currentPosition)) {
                    console.log(`${player} killed ${opponent} at position ${currentPosition}`);
                    this.setPiecePosition(opponent, opponentPiece, BASE_POSITIONS[opponent][opponentPiece]);
                    kill = true;
                    if (!playedCutSound) {
                        Sound.play('cut');
                        playedCutSound = true;
                    }
                }

                // Special home path cutting rules
                else if (this.canCutInHomePath(player, piece, opponent, opponentPiece)) {
                    console.log(`${player} cut ${opponent} in home path`);
                    // Send opponent token to opposite side (left side of their home area)
                    this.setPiecePosition(opponent, opponentPiece, BASE_POSITIONS[opponent][opponentPiece]);
                    kill = true;
                    if (!playedCutSound) {
                        Sound.play('cut');
                        playedCutSound = true;
                    }
                }
            });
        });

        return kill;
    }

    canCutInHomePath(player, piece, opponent, opponentPiece) {
        const playerPosition = this.currentPositions[player][piece];
        const opponentPosition = this.currentPositions[opponent][opponentPiece];

        // Only allow cutting if opponent is in their home path
        if (!HOME_ENTRANCE[opponent].includes(opponentPosition)) {
            return false;
        }

        // Only clockwise next player can cut tokens in home paths
        const playerIndex = PLAYERS.indexOf(player);
        const opponentIndex = PLAYERS.indexOf(opponent);
        const nextPlayerIndex = (opponentIndex + 1) % 4;

        if (playerIndex !== nextPlayerIndex) {
            console.log(`${player} cannot cut ${opponent} - not clockwise next player`);
            return false;
        }

        // Check if player is approaching from right side (clockwise direction)
        const rightSidePosition = this.getRightSideApproachPosition(opponent);

        if (playerPosition === rightSidePosition) {
            console.log(`${player} can cut ${opponent} in home path from right side`);
            return true;
        }

        return false;
    }

    getRightSideApproachPosition(opponent) {
        // Get the position just before opponent's home entrance (right side approach)
        const homeEntranceStart = HOME_ENTRANCE[opponent][0];

        if (homeEntranceStart === 0) {
            return 51; // Wrap around
        }
        return homeEntranceStart - 1;
    }

    hasPlayerWon(player) {
        return [0, 1, 2, 3].every(piece => this.currentPositions[player][piece] === HOME_POSITIONS[player])
    }

    incrementPiecePosition(player, piece) {
        this.setPiecePosition(player, piece, this.getIncrementedPosition(player, piece));
    }

    decrementPiecePosition(player, piece) {
        const currentPosition = this.currentPositions[player][piece];
        let newPosition;

        if (currentPosition === 0) {
            newPosition = 51;
        } else {
            newPosition = currentPosition - 1;
        }

        this.setPiecePosition(player, piece, newPosition);
    }

    getIncrementedPosition(player, piece) {
        const currentPosition = this.currentPositions[player][piece];

        if (currentPosition === TURNING_POINTS[player]) {
            return HOME_ENTRANCE[player][0];
        } else if (currentPosition === 51) {
            return 0;
        }
        return currentPosition + 1;
    }

    getBackwardPosition(currentPos, steps) {
        let position = currentPos;
        for (let i = 0; i < steps; i++) {
            if (position === 0) {
                position = 51;
            } else {
                position--;
            }
        }
        return position;
    }

    canMoveBackward(player, piece) {
        const currentPosition = this.currentPositions[player][piece];

        if (currentPosition === BASE_POSITIONS[player][piece]) {
            return false;
        }

        if (currentPosition - this.diceValue < BASE_POSITIONS[player][piece]) {
            return false;
        }

        return true;
    }

    isEligiblePiece(player, piece) {
        const currentPosition = this.currentPositions[player][piece];

        if (currentPosition === HOME_POSITIONS[player]) {
            return false;
        }

        // Tokens can only open from base with a 6
        if (
            BASE_POSITIONS[player].includes(currentPosition) &&
            this.diceValue !== 6
        ) {
            return false;
        }

        if (
            HOME_ENTRANCE[player].includes(currentPosition) &&
            this.diceValue > HOME_POSITIONS[player] - currentPosition
        ) {
            return false;
        }

        return true;
    }

    getNewPosition(player, piece, moveBy) {
        const currentPosition = this.currentPositions[player][piece];

        // If token is in base and rolling 6, move to start position
        if (BASE_POSITIONS[player].includes(currentPosition) && this.diceValue === 6) {
            return START_POSITIONS[player];
        }

        let position = currentPosition;
        for (let i = 0; i < moveBy; i++) {
            const nextPosition = this.getIncrementedPosition(player, piece);
            position = nextPosition;
        }
        return position;
    }

    getIncrementedPositionForMove(currentPosition, player) {
        if (currentPosition === TURNING_POINTS[player]) {
            return HOME_ENTRANCE[player][0];
        } else if (currentPosition === 51) {
            return 0;
        }
        return currentPosition + 1;
    }

    hasOpenTokens(player) {
        return [0, 1, 2, 3].some(piece => !BASE_POSITIONS[player].includes(this.currentPositions[player][piece]));
    }

    shouldAutoOpenToken(player) {
        const startPos = START_POSITIONS[player];

        // Check all opponents
        for (let opponent of PLAYERS) {
            if (opponent === player) continue;

            for (let piece = 0; piece < 4; piece++) {
                const opponentPos = this.currentPositions[opponent][piece];

                // Skip if opponent piece is in base or home
                if (BASE_POSITIONS[opponent].includes(opponentPos) ||
                    HOME_POSITIONS[opponent] === opponentPos) continue;

                // Calculate distance to player's start position
                const distance = this.calculateDistance(opponentPos, startPos);

                // Auto-open if opponent is 4-10 steps away from start position
                if (distance >= 4 && distance <= 10) {
                    console.log(`Auto-opening ${player} token - ${opponent} approaching within ${distance} steps`);
                    return true;
                }

                // Auto-open if opponent crossed start position and is 10-15 steps away
                if (this.hasCrossedPosition(opponentPos, startPos) && distance >= 10 && distance <= 15) {
                    console.log(`Auto-opening ${player} token - ${opponent} crossed start position, ${distance} steps away`);
                    return true;
                }
            }
        }
        return false;
    }

    calculateDistance(fromPos, toPos) {
        // Calculate circular distance on the board (0-51)
        if (fromPos <= toPos) {
            return toPos - fromPos;
        } else {
            return (52 - fromPos) + toPos;
        }
    }

    hasCrossedPosition(currentPos, targetPos) {
        // Simple check if position has been crossed (this is a basic implementation)
        return currentPos > targetPos;
    }

    isBackwardMovement(player, piece) {
        const currentPosition = this.currentPositions[player][piece];

        // Check if this piece was selected for backward movement
        const backwardPieces = this.getEligibleBackwardPieces(player);
        return backwardPieces.includes(piece);
    }
}
