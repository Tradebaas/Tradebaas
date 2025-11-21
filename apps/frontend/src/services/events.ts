type Listener = (evt: any) => void;

const listeners = new Set<Listener>();

export const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
export const publish = (evt: any) => { listeners.forEach(l => { try { l(evt); } catch (e) { /* ignore */ } }); };

export default { subscribe, publish };
