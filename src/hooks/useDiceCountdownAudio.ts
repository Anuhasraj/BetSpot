import { useEffect, useRef } from 'react';
import { DiceBoard } from '../domain/DiceBoard';
import { GamePhase } from '../domain/types';
import { soundFx } from '../services/SoundFxService';

interface CountdownSnapshot {
  boardId: string;
  phase: GamePhase;
  lobbySeconds: number;
  sideBetSeconds: number | null;
  turnRollSeconds: number | null;
  hasPendingRoll: boolean;
}

/**
 * Plays escalating countdown audio cues before dice rolls, auto-roll timeouts, and match start
 * while the user is actively viewing a board room.
 */
export function useDiceCountdownAudio(board: DiceBoard | null | undefined, enabled: boolean): void {
  const prevRef = useRef<CountdownSnapshot | null>(null);

  // Ensure Web Audio Context is unlocked on the first user gesture in the room
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const handleUnlock = () => {
      soundFx.unlock();
    };
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, [enabled]);

  const boardId = board?.id ?? '';
  const phase = board?.phase ?? GamePhase.WAITING_FOR_PLAYERS;
  const lobbySeconds = board?.lobbySecondsRemaining ?? 0;
  const sideBetSeconds = board?.activeSideBetRound?.secondsRemaining ?? null;
  const hasPendingRoll = Boolean(board?.pendingRollReveal);
  const turnRollSeconds =
    (phase === GamePhase.IN_PROGRESS_ROLL || phase === GamePhase.TIE_BREAKER) && !hasPendingRoll
      ? (board?.turnRollSecondsRemaining ?? null)
      : null;

  useEffect(() => {
    if (!enabled || !boardId) {
      prevRef.current = null;
      return;
    }

    const curr: CountdownSnapshot = {
      boardId,
      phase,
      lobbySeconds,
      sideBetSeconds,
      turnRollSeconds,
      hasPendingRoll,
    };

    const prev = prevRef.current;
    prevRef.current = curr;

    if (!prev || prev.boardId !== curr.boardId) {
      return;
    }

    // Detect countdown completion transitions
    if (
      prev.phase === GamePhase.SIDE_BET_WINDOW &&
      (curr.phase === GamePhase.IN_PROGRESS_ROLL || curr.phase === GamePhase.TIE_BREAKER)
    ) {
      soundFx.playCountdownComplete('roll');
      return;
    }

    if (prev.phase === GamePhase.LOBBY_COUNTDOWN && curr.phase === GamePhase.SIDE_BET_WINDOW) {
      soundFx.playCountdownComplete('lobby');
      return;
    }

    if (!prev.hasPendingRoll && curr.hasPendingRoll && prev.turnRollSeconds === 0) {
      soundFx.playCountdownComplete('roll');
      return;
    }

    // Warn players in the final 10s of a roll turn before auto-throw triggers
    if (
      (curr.phase === GamePhase.IN_PROGRESS_ROLL || curr.phase === GamePhase.TIE_BREAKER) &&
      !curr.hasPendingRoll &&
      curr.turnRollSeconds !== null &&
      curr.turnRollSeconds > 0 &&
      curr.turnRollSeconds <= 10 &&
      curr.turnRollSeconds !== prev.turnRollSeconds
    ) {
      soundFx.playCountdownTick(curr.turnRollSeconds, 'roll');
      return;
    }

    // Play per-second escalating tick during active pre-roll side-bet countdown
    if (
      curr.phase === GamePhase.SIDE_BET_WINDOW &&
      curr.sideBetSeconds !== null &&
      curr.sideBetSeconds > 0 &&
      curr.sideBetSeconds !== prev.sideBetSeconds
    ) {
      soundFx.playCountdownTick(curr.sideBetSeconds, 'roll');
      return;
    }

    // Play per-second escalating tick during lobby countdown
    if (
      curr.phase === GamePhase.LOBBY_COUNTDOWN &&
      curr.lobbySeconds > 0 &&
      curr.lobbySeconds !== prev.lobbySeconds
    ) {
      soundFx.playCountdownTick(curr.lobbySeconds, 'lobby');
    }
  }, [enabled, boardId, phase, lobbySeconds, sideBetSeconds, turnRollSeconds, hasPendingRoll]);
}
