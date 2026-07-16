export type GameState = 'setup' | 'playing' | 'battle' | 'game_over';

export class GameLogic {
  state: GameState = 'setup';
  currentPlayer: number = 1;
  turnsLeft: number = 10;
  turnPhase: number = 0;
  matrix: number[][] = Array(2).fill(0).map(() => Array(3).fill(0));
  battleContext: { row: number, col: number } | null = null;
  scores = { 1: 0, 2: 0 };

  startGame(startingPlayer: number) {
    this.state = 'playing';
    this.currentPlayer = startingPlayer;
    this.turnsLeft = 10;
    this.turnPhase = 0;
    this.matrix = Array(2).fill(0).map(() => Array(3).fill(0));
    this.battleContext = null;
    this.scores = { 1: 0, 2: 0 };
  }

  resetGame() {
    this.state = 'setup';
    this.currentPlayer = 1;
    this.turnsLeft = 10;
    this.turnPhase = 0;
    this.matrix = Array(2).fill(0).map(() => Array(3).fill(0));
    this.battleContext = null;
    this.scores = { 1: 0, 2: 0 };
  }

  handleAction(row: number, col: number): boolean {
    if (this.state !== 'playing') return false; // Ignore actions if not playing

    const currentOwner = this.matrix[row][col];
    
    // Rule: Claim empty spot
    if (currentOwner === 0) {
      this.matrix[row][col] = this.currentPlayer;
      this.finishTurn();
      return true;
    }
    
    // Rule: Battle (clicking opponent's spot)
    if (currentOwner !== 0 && currentOwner !== this.currentPlayer && currentOwner !== 3) {
      this.state = 'battle';
      this.matrix[row][col] = 3; // 3 denotes battle mode (blinking)
      this.battleContext = { row, col };
      return true;
    }

    // Rule: Pass turn (clicking own spot)
    if (currentOwner === this.currentPlayer) {
      this.finishTurn();
      return true;
    }

    return false;
  }

  resolveBattle(winner: number) {
    if (this.state !== 'battle' || !this.battleContext) return;
    
    const { row, col } = this.battleContext;
    this.matrix[row][col] = winner;
    this.state = 'playing';
    this.battleContext = null;
    
    this.finishTurn();
  }

  private finishTurn() {
    if (this.turnPhase === 1) {
      this.turnsLeft--;
      this.turnPhase = 0;
    } else {
      this.turnPhase = 1;
    }

    if (this.turnsLeft <= 0) {
      this.state = 'game_over';
      this.calculateScores();
    } else {
      // Swap turn
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }
  }

  private calculateScores() {
    let p1 = 0;
    let p2 = 0;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        if (this.matrix[r][c] === 1) p1++;
        if (this.matrix[r][c] === 2) p2++;
      }
    }
    this.scores = { 1: p1, 2: p2 };
  }

  getSnapshot() {
    return {
      state: this.state,
      currentPlayer: this.currentPlayer,
      turnsLeft: this.turnsLeft,
      matrix: this.matrix,
      battleContext: this.battleContext,
      scores: this.scores
    };
  }
}
