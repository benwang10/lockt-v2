import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The system "reduce motion" preference (iOS, Android "remove animations", web prefers-reduced-motion). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => mounted && setReduce(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduce(value));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
