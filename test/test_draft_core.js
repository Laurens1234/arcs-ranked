import assert from 'assert';
import { countCategoryPicksBeforeNextTurn } from '../assets/draft-core.js';

export async function runTests() {
  // Test 1: simple 3-player descending order, everyone needs 1 leader, my next turn after 2 picks
  const draft1 = {
    numPlayers: 3,
    order: [3,2,1], // descending pattern used in app (N..1)
    pickIndex: 0, // currently at order[0] -> player 3
    players: [ {leader:null, lore:[]}, {leader:null, lore:[]}, {leader:null, lore:[]} ]
  };
  // playerIdx = 0 (player 1). Starting pickIndex=0 (player3), next picks before player1: player2 then player1 (stop at player1)
  // Expected: only player2 picks before player1; player2 needs leader -> count 1
  let count = countCategoryPicksBeforeNextTurn(draft1, 0, 'leader', () => 1);
  assert.strictEqual(count, 1, 'Test1 leader count');

  // Test 2: 4 players with custom lore counts, check lore picks count
  const draft2 = {
    numPlayers: 4,
    order: [4,3,2,1],
    pickIndex: 1, // currently at order[1] -> player3
    players: [ {leader:null, lore:[/*0*/]}, {leader:null, lore:[/*0*/]}, {leader:null, lore:[]}, {leader:null, lore:[]} ]
  };
  // Custom lore counts: player1 needs 2, player2 needs 1, player3 needs 2, player4 needs 1
  function getLore(i) {
    return [2,1,2,1][i];
  }
  // For playerIdx=2 (player3), next picks before player3: player2, player1, player4 then player3 -> stops at player3
  // Remaining needs before: player1:2, player2:1, player4:1 -> picks that will consume lore slots in that order: player2 (1), player1 (1), player4 (1) => count 3
  const count2 = countCategoryPicksBeforeNextTurn(draft2, 2, 'lore', getLore);
  assert.strictEqual(count2, 3, 'Test2 lore count');

  // Test 3: If some players have zero remaining, they should be skipped
  const draft3 = {
    numPlayers: 3,
    order: [3,2,1],
    pickIndex: 0, // at player3
    players: [ {leader: {name:'x'}, lore:[/*1*/]}, {leader:null, lore:[/*1*/]}, {leader:null, lore:[]} ]
  };
  function getLore3(i) { return [1,1,1][i]; }
  // playerIdx 2 (player3): upcoming before player3: player2, player1 (stop). player1 already has leader non-null but that's irrelevant for lore.
  // remaining lore: p1:1, p2:1, p3:1 => player2 picks (consumes 1), player1 picks (consumes 1) => count 2
  const count3 = countCategoryPicksBeforeNextTurn(draft3, 2, 'lore', getLore3);
  assert.strictEqual(count3, 2, 'Test3 lore count');

  // Test 4: no picks before my next turn (immediate next)
  const draft4 = {
    numPlayers: 2,
    order: [2,1],
    pickIndex: 0, // at player2
    players: [ {leader:null, lore:[]}, {leader:null, lore:[]} ]
  };
  const count4 = countCategoryPicksBeforeNextTurn(draft4, 1, 'leader', () => 1);
  assert.strictEqual(count4, 1, 'Test4 leader count');
}
