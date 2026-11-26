import type { GameMetadata } from '../../protocol/protocol.js';

export const EINSTEIN_GAME: GameMetadata = {
  id: 'einstein',
  name: '爱因斯坦棋',
  version: '0.1.0',
  protocol: 1,
  minPlayers: 2,
  maxPlayers: 2,
  description: '5×5 骰棋：给棋子编号，按骰点移动最接近编号的棋子，先到对方角点或吃光对方获胜。',
  author: 'kwibaka',
  spectatorChat: true,
};
