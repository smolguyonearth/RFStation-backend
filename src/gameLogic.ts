export type AppMode = 'IDLE' | 'MUSEUM' | 'GAME';
export type Language = 'EN' | 'TH' | 'DE';
export type GamePhase = 'INIT' | 'TURN' | 'BATTLE' | 'END';

export class GameLogic {
  mode: AppMode = 'IDLE';
  language: Language = 'EN';
  
  // --- Game State ---
  gamePhase: GamePhase = 'INIT';
  currentPlayer: number = 1;
  
  // We keep two matrices: 
  // 1. pendingMatrix: Immediately updated on physical button press (for Arduino LEDs & Controller)
  // 2. displayMatrix: Only updated when "End Turn" is pressed (for the Monitor)
  pendingMatrix: number[][] = this.createEmptyMatrix();
  displayMatrix: number[][] = this.createEmptyMatrix();
  
  battleContext: { row: number, col: number } | null = null;
  scores = { 1: 0, 2: 0 };
  
  // --- Museum State ---
  activeMuseumLocation: { row: number, col: number } | null = null;

  private createEmptyMatrix() {
    return Array(2).fill(0).map(() => Array(3).fill(0));
  }

  setMode(mode: AppMode, language: Language = 'EN') {
    this.mode = mode;
    this.language = language;
    if (mode === 'GAME') {
      this.resetGame();
    } else if (mode === 'MUSEUM') {
      this.activeMuseumLocation = null;
      this.pendingMatrix = this.createEmptyMatrix();
      this.displayMatrix = this.createEmptyMatrix();
    } else {
      this.pendingMatrix = this.createEmptyMatrix();
      this.displayMatrix = this.createEmptyMatrix();
    }
  }

  // --- Game Mode Methods ---

  startGame(startingPlayer: number) {
    this.mode = 'GAME';
    this.gamePhase = 'TURN';
    this.currentPlayer = startingPlayer;
    this.pendingMatrix = this.createEmptyMatrix();
    this.displayMatrix = this.createEmptyMatrix();
    this.battleContext = null;
    this.scores = { 1: 0, 2: 0 };
  }

  resetGame() {
    this.mode = 'GAME';
    this.gamePhase = 'INIT';
    this.currentPlayer = 1;
    this.pendingMatrix = this.createEmptyMatrix();
    this.displayMatrix = this.createEmptyMatrix();
    this.battleContext = null;
    this.scores = { 1: 0, 2: 0 };
  }

  endTurn() {
    if (this.mode !== 'GAME') return;
    
    // Sync the display matrix with pending matrix
    this.displayMatrix = JSON.parse(JSON.stringify(this.pendingMatrix));
    
    if (this.gamePhase === 'BATTLE') {
      // Cannot end turn during battle
      return;
    }

    this.checkGameOver();
    if (this.gamePhase !== 'END') {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }
  }

  resolveBattle(winner: number) {
    if (this.gamePhase !== 'BATTLE' || !this.battleContext) return;
    
    const { row, col } = this.battleContext;
    this.pendingMatrix[row][col] = winner;
    this.gamePhase = 'TURN';
    this.battleContext = null;
    
    // Auto-end turn after battle resolution
    this.endTurn();
  }

  private checkGameOver() {
    let p1 = 0; let p2 = 0; let empty = 0;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const val = this.pendingMatrix[r][c];
        if (val === 1) p1++;
        else if (val === 2) p2++;
        else empty++;
      }
    }
    this.scores = { 1: p1, 2: p2 };
    if (empty === 0) {
      this.gamePhase = 'END';
    }
  }

  // --- Physical Button Ingestion ---

  handleAction(row: number, col: number): boolean {
    if (this.mode === 'MUSEUM') {
      // In museum mode, clicking a button sets it as active
      this.activeMuseumLocation = { row, col };
      
      // Light up ONLY this button on the Arduino (by making it "owned by P1")
      // Clear matrix, set one spot
      this.pendingMatrix = this.createEmptyMatrix();
      this.pendingMatrix[row][col] = 1; 
      
      // Museum mode syncs instantly to monitor
      this.displayMatrix = JSON.parse(JSON.stringify(this.pendingMatrix));
      return true;
    }

    if (this.mode === 'GAME' && this.gamePhase === 'TURN') {
      const currentOwner = this.pendingMatrix[row][col];
      
      // Empty spot -> claim
      if (currentOwner === 0) {
        this.pendingMatrix[row][col] = this.currentPlayer;
        this.endTurn(); // Auto-end turn on capture
        return true;
      }
      
      // Opponent spot -> battle
      if (currentOwner !== 0 && currentOwner !== this.currentPlayer && currentOwner !== 3) {
        this.gamePhase = 'BATTLE';
        this.pendingMatrix[row][col] = 3; // 3 = blinking on Arduino
        this.battleContext = { row, col };
        return true;
      }
    }

    return false;
  }

  getSnapshot() {
    return {
      mode: this.mode,
      language: this.language,
      gamePhase: this.gamePhase,
      currentPlayer: this.currentPlayer,
      displayMatrix: this.displayMatrix, 
      pendingMatrix: this.pendingMatrix, // Sent so Controller knows the truth
      battleContext: this.battleContext,
      scores: this.scores,
      activeMuseumLocation: this.activeMuseumLocation
    };
  }
}
