/**
 * Einstein chess browser module.
 * Numbering is a pre-game phase; dice, required piece, and move targets are
 * forced/public. The board is a 5×5 grid of square cells.
 */

const COLUMNS = 'ABCDE';
let numberingDraft = {};
let lastPhase = '';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function colorName(color) {
  return color === 'black' ? '黑棋' : '白棋';
}

function playerName(view, userId) {
  return view.players.find((player) => player.userId === userId)?.name || userId;
}

function phaseText(view, myColor) {
  if (view.status === 'finished') return '对局结束';
  if (view.status === 'waiting') return '等待双方准备';
  if (view.phase === 'numbering') return '编号阶段';
  if (view.roll !== null) {
    const target = view.requiredNumber !== null ? ` → 移动 ${view.requiredNumber} 号棋子` : '';
    return `骰子 ${view.roll}${target}${view.turn === myColor ? ' · 轮到你' : ''}`;
  }
  return '';
}

export function render(container, { view, onAction }) {
  container.replaceChildren();
  const root = el('div', 'einstein-shell');
  if (!view || view.schema !== 'einstein-v1') {
    root.appendChild(el('p', 'muted', '等待爱因斯坦棋视图…'));
    container.appendChild(root);
    return;
  }
  if (view.phase === 'numbering' && lastPhase !== 'numbering') numberingDraft = {};
  lastPhase = view.phase;

  const spectator = !view.you;
  const myColor = view.you?.color || null;
  const myTurn = view.status === 'playing' && view.turn === myColor;
  const moveTargets = new Set(view.moveTargets || []);
  const numberByIndex = new Map(
    view.pieces.filter((piece) => piece.number !== null).map((piece) => [piece.index, piece.number]),
  );

  const header = el('div', 'einstein-header');
  header.appendChild(el('span', 'einstein-mode', '5×5 · 编号骰棋'));
  header.appendChild(el('span', 'einstein-you', myColor ? `你执${colorName(myColor)}` : '观战中'));
  header.appendChild(
    el('span', 'einstein-turn', view.turn && view.phase !== 'finished' ? `${colorName(view.turn)}回合` : ''),
  );
  root.appendChild(header);
  root.appendChild(el('p', 'einstein-phase', phaseText(view, myColor)));

  const tools = el('div', 'einstein-tools');
  if (!spectator && view.status === 'playing') {
    const resign = el('button', 'einstein-button danger', '认输');
    resign.type = 'button';
    resign.addEventListener('click', () => {
      if (window.confirm('确定认输吗？')) onAction({ type: 'resign' });
    });
    tools.appendChild(resign);
  }
  root.appendChild(tools);

  if (view.phase === 'numbering' && !spectator && myColor) {
    if (view.numberingSubmitted) {
      root.appendChild(el('p', 'muted', '编号已提交，等待对手…'));
    } else {
      const panel = el('div', 'einstein-numbering');
      panel.appendChild(el('h3', '', '给棋子编号（1–6，各用一次）'));
      for (const piece of (view.ownPieces || []).slice().sort((a, b) => a.index - b.index)) {
        if (!(piece.id in numberingDraft)) numberingDraft[piece.id] = '';
        const row = el('label', 'einstein-number-row');
        row.appendChild(el('span', 'einstein-number-coord', piece.coord));
        const select = document.createElement('select');
        select.className = 'einstein-number-select';
        const empty = el('option', '', '—');
        empty.value = '';
        select.appendChild(empty);
        for (let number = 1; number <= 6; number += 1) {
          const option = el('option', '', String(number));
          option.value = String(number);
          select.appendChild(option);
        }
        select.value = numberingDraft[piece.id] || '';
        select.addEventListener('change', () => {
          numberingDraft[piece.id] = select.value;
        });
        row.appendChild(select);
        panel.appendChild(row);
      }
      const submit = el('button', 'einstein-button primary', '提交编号');
      submit.type = 'button';
      submit.addEventListener('click', () => {
        const numbers = {};
        for (const piece of view.ownPieces || []) {
          const value = Number(numberingDraft[piece.id]);
          if (!Number.isInteger(value) || value < 1 || value > 6) {
            window.alert('请为每枚棋子选择 1–6');
            return;
          }
          numbers[piece.id] = value;
        }
        if (new Set(Object.values(numbers)).size !== 6) {
          window.alert('六个编号不能重复');
          return;
        }
        onAction({ type: 'numbering', numbers });
      });
      panel.appendChild(submit);
      root.appendChild(panel);
    }
  }

  const board = el('div', 'einstein-board');
  board.setAttribute('role', 'grid');
  for (let index = 0; index < view.size * view.size; index += 1) {
    const value = view.board?.[index] ?? null;
    const piece = view.pieces.find((candidate) => candidate.index === index);
    const number = numberByIndex.get(index);
    const required = myTurn && view.requiredPiece === index;
    const canSelect = required && view.selected === null;
    const canMove = myTurn && moveTargets.has(index);
    const cell = el(
      'button',
      `einstein-cell${(Math.floor(index / view.size) + index) % 2 ? ' dark' : ''}${value ? ` has-${value}` : ''}${required ? ' required' : ''}${view.selected === index ? ' selected' : ''}${canMove ? ' move-target' : ''}${view.lastMove?.to === index ? ' last' : ''}`,
    );
    cell.type = 'button';
    cell.setAttribute('role', 'gridcell');
    cell.title = `${COLUMNS[index % view.size]}${Math.floor(index / view.size) + 1}`;
    if (value) {
      const stone = el('span', `einstein-piece ${value}`, number === undefined ? '' : String(number));
      cell.appendChild(stone);
    }
    if (canSelect || canMove) {
      cell.classList.add('clickable');
      cell.addEventListener('click', () => {
        if (canSelect) onAction({ type: 'select', index });
        else if (canMove) onAction({ type: 'move', to: index });
      });
    }
    cell.disabled = !cell.classList.contains('clickable');
    board.appendChild(cell);
  }
  root.appendChild(board);

  const legend = el('div', 'einstein-legend');
  for (const player of view.players) {
    legend.appendChild(el('span', `einstein-player ${player.color}`, `${player.name} · ${colorName(player.color)}`));
  }
  root.appendChild(legend);

  if (view.result) {
    const result = el('div', 'einstein-result');
    const winner = view.result.winners.length
      ? `${view.result.winners.map((id) => playerName(view, id)).join('、')} 获胜`
      : '对局结束';
    const reason = {
      corner: '到达对方角点',
      capture_all: '吃光对方棋子',
      resign: '认输',
    }[view.result.reason] || view.result.reason;
    result.appendChild(el('strong', '', winner));
    result.appendChild(el('span', 'muted', reason));
    root.appendChild(result);
  }

  container.appendChild(root);
}
