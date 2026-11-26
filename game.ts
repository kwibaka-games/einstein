import { randomInt } from 'node:crypto';
import type { GameToPlatform, PlatformToGame, Seat } from '../../protocol/protocol.js';
import { EINSTEIN_GAME } from './metadata.js';
import type {
  EinsteinAction,
  EinsteinCell,
  EinsteinColor,
  EinsteinPhase,
  EinsteinPieceView,
  EinsteinResult,
  EinsteinView,
} from './types.js';

const SIZE = 5;
const CORNER_WHITE = 0; // A1
const CORNER_BLACK = 24; // E5
const COLUMNS = 'ABCDE';

interface Piece {
  id: string;
  color: EinsteinColor;
  index: number;
  number: number | null;
}

interface Match {
  id: string;
  seats: Seat[];
  board: EinsteinCell[];
  pieces: Piece[];
  colors: Record<EinsteinColor, string>;
  turn: EinsteinColor;
  status: 'waiting' | 'playing' | 'finished';
  phase: EinsteinPhase;
  roll: number | null;
  requiredPiece: number | null;
  selected: number | null;
  lastMove: EinsteinView['lastMove'] | null;
  numbering: Set<EinsteinColor>;
  ready: Set<string>;
  result: EinsteinResult | null;
  started: boolean;
  seq: number;
}

export function opposite(color: EinsteinColor): EinsteinColor {
  return color === 'black' ? 'white' : 'black';
}

export function coordinate(index: number): string {
  return `${COLUMNS[index % SIZE]}${Math.floor(index / SIZE) + 1}`;
}

export function initialPieces(): Piece[] {
  const pieces: Piece[] = [];
  const black = [0, 5, 10, 1, 6, 2]; // A1,A2,A3,B1,B2,C1
  const white = [22, 18, 23, 14, 19, 24]; // C5,D4,D5,E3,E4,E5
  black.forEach((index, i) => pieces.push({ id: `b${i + 1}`, color: 'black', index, number: null }));
  white.forEach((index, i) => pieces.push({ id: `w${i + 1}`, color: 'white', index, number: null }));
  return pieces;
}

export function initialBoard(pieces: Piece[]): EinsteinCell[] {
  const board: EinsteinCell[] = Array<EinsteinCell>(SIZE * SIZE).fill(null);
  for (const piece of pieces) board[piece.index] = piece.color;
  return board;
}

export function legalTargets(index: number, color: EinsteinColor): number[] {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const steps = color === 'black'
    ? [[0, 1], [1, 0], [1, 1]]
    : [[0, -1], [-1, 0], [-1, -1]];
  const result: number[] = [];
  for (const [dr, dc] of steps) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) result.push(r * SIZE + c);
  }
  return result;
}

export function requiredNumber(
  pieces: Piece[],
  color: EinsteinColor,
  roll: number,
): number | null {
  const available = pieces
    .filter((piece) => piece.color === color && piece.number !== null)
    .map((piece) => piece.number!);
  if (available.length === 0) return null;
  const exact = available.find((number) => number === roll);
  if (exact !== undefined) return exact;
  return available.sort((a, b) => Math.abs(a - roll) - Math.abs(b - roll) || a - b)[0]!;
}

export class EinsteinMatch {
  private readonly matches = new Map<string, Match>();
  private readonly rollDie: () => number;

  constructor(
    private readonly send: (message: GameToPlatform) => void,
    rollDie: () => number = () => randomInt(1, 7),
  ) {
    this.rollDie = rollDie;
  }

  getMetadata(): typeof EINSTEIN_GAME {
    return EINSTEIN_GAME;
  }

  handle(message: PlatformToGame): void {
    switch (message.t) {
      case 'match.create':
        this.create(message.matchId, message.seats);
        return;
      case 'player.ready':
        this.ready(message.matchId, message.playerId);
        return;
      case 'action':
        this.action(message.matchId, message.playerId, message.action);
        return;
      case 'player.connection':
        if (message.connected) this.sendViewToPlayer(message.matchId, message.playerId);
        return;
      case 'match.abort':
        this.matches.delete(message.matchId);
        return;
      default:
        return;
    }
  }

  private create(matchId: string, seats: Seat[]): void {
    if (seats.length !== 2) {
      this.send({
        v: 1,
        t: 'error',
        matchId,
        code: 'E_PLAYERS',
        message: '爱因斯坦棋需要正好 2 名玩家',
      });
      return;
    }
    const pieces = initialPieces();
    const match: Match = {
      id: matchId,
      seats,
      board: initialBoard(pieces),
      pieces,
      colors: { black: seats[0]!.userId, white: seats[1]!.userId },
      turn: 'black',
      status: 'waiting',
      phase: 'waiting',
      roll: null,
      requiredPiece: null,
      selected: null,
      lastMove: null,
      numbering: new Set(),
      ready: new Set(),
      result: null,
      started: false,
      seq: 1,
    };
    this.matches.set(matchId, match);
    this.sendViews(match);
  }

  private ready(matchId: string, playerId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.started) return;
    if (!match.seats.some((seat) => seat.userId === playerId)) return;
    match.ready.add(playerId);
    if (!match.seats.every((seat) => match.ready.has(seat.userId))) return;
    match.started = true;
    match.status = 'playing';
    match.phase = 'numbering';
    this.send({ v: 1, t: 'match.started', matchId });
    this.sendViews(match);
  }

  private action(matchId: string, playerId: string, action: unknown): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'playing' || !action || typeof action !== 'object') return;
    const color = this.colorOf(match, playerId);
    if (!color) return;
    const type = (action as { type?: unknown }).type;

    if (type === 'resign') {
      match.seq += 1;
      this.finish(match, {
        winners: [match.colors[opposite(color)]],
        reason: 'resign',
        board: [...match.board],
      });
      return;
    }
    if (type === 'numbering') {
      this.numbering(match, playerId, color, action as { numbers?: unknown });
      return;
    }
    if (match.phase !== 'playing') {
      this.error(matchId, playerId, 'E_PHASE', '当前阶段不能落子');
      return;
    }
    if (match.turn !== color) {
      this.error(matchId, playerId, 'E_TURN', '还没轮到你');
      return;
    }
    if (type === 'select') this.select(match, playerId, color, action as { index?: unknown });
    else if (type === 'move') this.move(match, playerId, color, action as { to?: unknown });
    else this.error(matchId, playerId, 'E_ILLEGAL', '未知动作');
  }

  private numbering(
    match: Match,
    playerId: string,
    color: EinsteinColor,
    action: { numbers?: unknown },
  ): void {
    if (match.phase !== 'numbering') {
      this.error(match.id, playerId, 'E_PHASE', '现在不是编号阶段');
      return;
    }
    if (match.numbering.has(color)) {
      this.error(match.id, playerId, 'E_NUMBERING', '已经提交过编号');
      return;
    }
    const values = action.numbers;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      this.error(match.id, playerId, 'E_NUMBERING', '编号格式不正确');
      return;
    }
    const own = match.pieces.filter((piece) => piece.color === color);
    if (own.length !== 6) {
      this.error(match.id, playerId, 'E_NUMBERING', '棋子数量不正确');
      return;
    }
    const numbers = new Set<number>();
    for (const piece of own) {
      const value = Number((values as Record<string, unknown>)[piece.id]);
      if (!Number.isInteger(value) || value < 1 || value > 6 || numbers.has(value)) {
        this.error(match.id, playerId, 'E_NUMBERING', '必须给六枚棋子分配 1–6 且不重复');
        return;
      }
      numbers.add(value);
    }
    for (const piece of own) {
      piece.number = Number((values as Record<string, number>)[piece.id]);
    }
    match.numbering.add(color);
    match.seq += 1;
    if (match.numbering.size === 2) {
      match.phase = 'playing';
      this.beginTurn(match, 'black');
      return;
    }
    this.sendViews(match);
  }

  private beginTurn(match: Match, color: EinsteinColor): void {
    match.turn = color;
    match.roll = this.rollDie();
    const number = requiredNumber(match.pieces, color, match.roll);
    const piece = match.pieces.find(
      (candidate) => candidate.color === color && candidate.number === number,
    );
    match.requiredPiece = piece?.index ?? null;
    match.selected = null;
    match.phase = 'playing';
    match.seq += 1;
    this.sendViews(match);
  }

  private select(
    match: Match,
    playerId: string,
    color: EinsteinColor,
    action: { index?: unknown },
  ): void {
    const index = Number(action.index);
    if (match.requiredPiece === null || index !== match.requiredPiece) {
      this.error(match.id, playerId, 'E_DICE', '骰子决定只能移动指定棋子');
      return;
    }
    if (match.board[index] !== color) {
      this.error(match.id, playerId, 'E_ILLEGAL', '只能选择自己的棋子');
      return;
    }
    match.selected = index;
    match.seq += 1;
    this.sendViews(match);
  }

  private move(
    match: Match,
    playerId: string,
    color: EinsteinColor,
    action: { to?: unknown },
  ): void {
    if (match.selected === null || match.requiredPiece === null) {
      this.error(match.id, playerId, 'E_PHASE', '请先选择骰子指定的棋子');
      return;
    }
    const from = match.selected;
    const to = Number(action.to);
    if (!legalTargets(from, color).includes(to)) {
      this.error(match.id, playerId, 'E_ILLEGAL', '这个位置无法到达');
      return;
    }
    const targetPiece = match.pieces.find((piece) => piece.index === to);
    const moving = match.pieces.find((piece) => piece.index === from);
    if (!moving) {
      this.error(match.id, playerId, 'E_ILLEGAL', '棋子不存在');
      return;
    }
    if (targetPiece) {
      match.pieces = match.pieces.filter((piece) => piece.index !== to);
    }
    match.board[from] = null;
    match.board[to] = color;
    moving.index = to;
    match.lastMove = {
      from,
      to,
      ...(targetPiece ? { captured: targetPiece.index } : {}),
      pieceColor: color,
    };
    match.selected = null;
    match.seq += 1;

    if (color === 'black' && to === CORNER_BLACK) {
      this.finish(match, { winners: [match.colors[color]], reason: 'corner', board: [...match.board] });
      return;
    }
    if (color === 'white' && to === CORNER_WHITE) {
      this.finish(match, { winners: [match.colors[color]], reason: 'corner', board: [...match.board] });
      return;
    }
    const opponent = opposite(color);
    if (!match.pieces.some((piece) => piece.color === opponent)) {
      this.finish(match, { winners: [match.colors[color]], reason: 'capture_all', board: [...match.board] });
      return;
    }
    this.beginTurn(match, opponent);
  }

  private finish(match: Match, result: EinsteinResult): void {
    match.status = 'finished';
    match.phase = 'finished';
    match.selected = null;
    match.result = result;
    this.sendViews(match);
    this.send({ v: 1, t: 'result', matchId: match.id, result });
  }

  private colorOf(match: Match, userId: string): EinsteinColor | null {
    if (match.colors.black === userId) return 'black';
    if (match.colors.white === userId) return 'white';
    return null;
  }

  private pieceView(piece: Piece): EinsteinPieceView {
    return {
      id: piece.id,
      index: piece.index,
      color: piece.color,
      number: piece.number,
      coord: coordinate(piece.index),
    };
  }

  private viewFor(match: Match, userId: string | null): EinsteinView {
    const color = userId ? this.colorOf(match, userId) : null;
    const ownSelected =
      color !== null &&
      match.selected !== null &&
      match.board[match.selected] === color;
    return {
      schema: 'einstein-v1',
      status: match.status,
      phase: match.phase,
      size: SIZE,
      board: [...match.board],
      pieces: match.pieces.map((piece) => this.pieceView(piece)),
      ownPieces: color ? match.pieces.filter((piece) => piece.color === color).map((piece) => this.pieceView(piece)) : [],
      players: match.seats.map((seat) => ({
        userId: seat.userId,
        name: seat.name,
        seat: seat.seat,
        color: this.colorOf(match, seat.userId)!,
      })),
      you: userId ? { userId, color: this.colorOf(match, userId)! } : null,
      turn: match.status === 'playing' ? match.turn : null,
      roll: match.roll,
      requiredNumber:
        match.requiredPiece !== null
          ? match.pieces.find((piece) => piece.index === match.requiredPiece)?.number ?? null
          : null,
      requiredPiece: match.phase === 'playing' ? match.requiredPiece : null,
      selected: ownSelected ? match.selected : null,
      ...(ownSelected && match.phase === 'playing' && match.selected !== null
        ? { moveTargets: legalTargets(match.selected, color!) }
        : {}),
      numberingSubmitted: color ? match.numbering.has(color) : false,
      ...(match.lastMove ? { lastMove: match.lastMove } : {}),
      ...(match.result ? { result: match.result } : {}),
    };
  }

  private sendViews(match: Match): void {
    for (const seat of match.seats) {
      this.send({
        v: 1,
        t: 'view',
        matchId: match.id,
        to: `player:${seat.userId}`,
        seq: match.seq,
        view: this.viewFor(match, seat.userId),
        actions: [],
      });
    }
    this.send({
      v: 1,
      t: 'view',
      matchId: match.id,
      to: 'spectator',
      seq: match.seq,
      view: this.viewFor(match, null),
      actions: [],
    });
  }

  private sendViewToPlayer(matchId: string, playerId: string): void {
    const match = this.matches.get(matchId);
    if (!match || !this.colorOf(match, playerId)) return;
    this.send({
      v: 1,
      t: 'view',
      matchId,
      to: `player:${playerId}`,
      seq: match.seq,
      view: this.viewFor(match, playerId),
      actions: [],
    });
  }

  private error(matchId: string, playerId: string, code: string, message: string): void {
    this.send({ v: 1, t: 'error', matchId, playerId, code, message });
  }
}
