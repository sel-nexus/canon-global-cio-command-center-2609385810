/** Load and mutate server history without browser persistence or stale-owner responses. */
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient.js';

/** Scope every draft, request and response to the current account and bearer session. */
export function useServerAssistant(account, token, onExpired) {
  const owner = account && token ? `${account.id}:${token}` : '';
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const requests = useRef(new Set());
  const busy = useRef(null);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const empty = { owner, open: false, input: '', prompt: '', messages: [], total: 0,
    loading: false, pending: false, error: '', loaded: false, focusRequest: 0 };
  const [state, setState] = useState(empty);
  // Mask the prior account synchronously, before effects or network callbacks run.
  const visible = state.owner === owner ? state : empty;

  useEffect(() => {
    setState({ ...empty });
    busy.current = null;
    return () => {
      requests.current.forEach((controller) => controller.abort());
      requests.current.clear();
    };
  }, [owner]);

  /** Read pages sequentially, preserving creation order and ignoring old sessions. */
  async function load() {
    if (!owner || busy.current === owner) return false;
    busy.current = owner;
    const controller = new AbortController();
    requests.current.add(controller);
    setState((value) => ({ ...value, loading: true, error: '' }));
    try {
      const messages = [];
      let total = 0;
      do {
        const page = await apiClient.assistantHistory(token, controller.signal, 100, messages.length);
        if (currentOwner.current !== owner || controller.signal.aborted) return false;
        total = page.total;
        messages.push(...page.items);
        if (messages.length < total && page.items.length === 0) throw new Error('The server returned incomplete assistant history.');
      } while (messages.length < total);
      if (currentOwner.current !== owner || controller.signal.aborted) return false;
      setState((value) => ({ ...value, messages, total, loaded: true }));
      return true;
    } catch (failure) {
      if (currentOwner.current === owner && !controller.signal.aborted) {
        setState((value) => ({ ...value, error: failure.message }));
        if (failure.status === 401) expired.current?.(token);
      }
      return false;
    } finally {
      requests.current.delete(controller);
      if (currentOwner.current === owner && !controller.signal.aborted) {
        busy.current = null;
        setState((value) => ({ ...value, loading: false }));
      }
    }
  }

  useEffect(() => {
    if (visible.open && !visible.loaded && !visible.error) load();
  }, [owner, visible.open, visible.loaded]);

  /** Serialize submissions, waiting for restoration before appending a saved response. */
  async function respond(prompt) {
    if (!owner || busy.current === owner) return;
    setState((value) => ({ ...value, open: true, input: prompt, prompt,
      focusRequest: value.focusRequest + 1 }));
    if (!visible.loaded && !(await load())) return;
    if (currentOwner.current !== owner) return;
    busy.current = owner;
    const controller = new AbortController();
    requests.current.add(controller);
    setState((value) => ({ ...value, pending: true, error: '' }));
    try {
      const message = await apiClient.assistantMessage(token, prompt, controller.signal);
      if (currentOwner.current === owner && !controller.signal.aborted) {
        setState((value) => ({ ...value, messages: [...value.messages, message], total: value.total + 1 }));
      }
    } catch (failure) {
      if (currentOwner.current === owner && !controller.signal.aborted) {
        setState((value) => ({ ...value, error: failure.message }));
        if (failure.status === 401) expired.current?.(token);
      }
    } finally {
      requests.current.delete(controller);
      if (currentOwner.current === owner && !controller.signal.aborted) {
        busy.current = null;
        setState((value) => ({ ...value, pending: false }));
      }
    }
  }

  return { ...visible, respond, retry: load,
    setInput: (input) => setState((value) => ({ ...value, input })),
    openPanel: () => setState((value) => ({ ...value, open: true })),
    closePanel: () => setState((value) => ({ ...value, open: false })),
  };
}
