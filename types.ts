export type EinsteinColor = 'black' | 'white';
export type EinsteinCell = EinsteinColor | null;
export type EinsteinPhase = 'waiting' | 'numbering' | 'playing' | 'finished';

export interface EinsteinPieceView {
  id: string;
  index: number;
  color: EinsteinColor;
  number: number | null;
  coord: string;
}

export interface EinsteinPlayerView {
  userId: string;
  name: string;
  seat: number;
  color: EinsteinColor;
}

export interface EinsteinResult {
  winners: string[];
  reason: 'corner' | 'capture_all' | 'resign';
  board: EinsteinCell[];
}

export interface EinsteinView {
  schema: 'einstein-v1';
  status: 'waiting' | 'playing' | 'finished';
  phase: EinsteinPhase;
  size: number;
  board: EinsteinCell[];
  pieces: EinsteinPieceView[];
  ownPieces: EinsteinPieceView[];
  players: EinsteinPlayerView[];
  you: { userId: string; color: EinsteinColor } | null;
  turn: EinsteinColor | null;
  roll: number | null;
  requiredNumber: number | null;
  requiredPiece: number | null;
  selected: number | null;
  moveTargets?: number[];
  numberingSubmitted: boolean;
  lastMove?: { from: number; to: number; captured?: number; pieceColor: EinsteinColor };
  result?: EinsteinResult;
}

export type EinsteinAction =
  | { type: 'numbering'; numbers: Record<string, number> }
  | { type: 'select'; index: number }
  | { type: 'move'; to: number }
  | { type: 'resign' };
