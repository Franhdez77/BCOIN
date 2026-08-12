'use client';

import { useCallback, useRef, useState } from 'react';

import { getSafeErrorMessage, type SafeErrorMessage } from './messages';

interface SubmissionState extends SafeErrorMessage {
  pending: boolean;
}

const INITIAL_STATE: SubmissionState = {
  message: '',
  pending: false,
};

export function useSubmission() {
  const locked = useRef(false);
  const [state, setState] = useState<SubmissionState>(INITIAL_STATE);

  const run = useCallback(
    async (task: () => Promise<unknown>, fallback?: string): Promise<boolean> => {
      if (locked.current) {
        return false;
      }

      locked.current = true;
      setState({ message: '', pending: true });

      try {
        await task();
        setState(INITIAL_STATE);
        return true;
      } catch (error: unknown) {
        setState({ ...getSafeErrorMessage(error, fallback), pending: false });
        return false;
      } finally {
        locked.current = false;
      }
    },
    [],
  );

  const setError = useCallback((message: string): void => {
    setState({ message, pending: false });
  }, []);

  return { ...state, run, setError };
}
