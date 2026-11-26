import { useEffect, useState } from 'react';
import { betSpotEngine } from '../services/BetSpotEngine';

export function useBetSpotEngine() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = betSpotEngine.eventBus.subscribe(() => {
      setVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  return betSpotEngine;
}
