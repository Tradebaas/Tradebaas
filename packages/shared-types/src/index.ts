// Shared TypeScript types between frontend and backend
// Future: Move common interfaces here (User, Strategy, Trade, etc.)

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface Strategy {
  name: string;
  instrument: string;
  status: 'active' | 'stopped' | 'paused' | 'error';
}

// Export more shared types here as needed
