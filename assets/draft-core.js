export function countCategoryPicksBeforeNextTurn(draft, playerIdx, category, getLoreCountForPlayer) {
  // Build mutable copy of each player's remaining need for the category
  const remaining = new Array(draft.numPlayers).fill(0);
  for (let i = 0; i < draft.numPlayers; i++) {
    if (category === 'leader') {
      remaining[i] = draft.players[i].leader ? 0 : 1;
    } else {
      remaining[i] = Math.max(0, getLoreCountForPlayer(i) - draft.players[i].lore.length);
    }
  }
  const myPlayerNum = playerIdx + 1;
  let count = 0;
  // Start checking from the next pick
  for (let j = 1; j <= draft.order.length; j++) {
    const idx = (draft.pickIndex + j) % draft.order.length;
    const drafter = draft.order[idx];
    if (drafter === myPlayerNum) break; // we've reached my next turn
    const drafterIdx = drafter - 1;
    if (remaining[drafterIdx] > 0) {
      remaining[drafterIdx]--;
      count++;
    }
  }
  return count;
}
