'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';

export default function AppearanceToggle() {
  const { appearance, setAppearance } = useTheme();

  return (
    <div className="app-appearance" role="group" aria-label="Appearance">
      <button
        type="button"
        onClick={() => setAppearance('light')}
        className={`app-appearance__btn${appearance === 'light' ? ' is-active' : ''}`}
        aria-pressed={appearance === 'light'}
        title="Light appearance"
      >
        <Sun className="h-3.5 w-3.5" />
        Light
      </button>
      <button
        type="button"
        onClick={() => setAppearance('dark')}
        className={`app-appearance__btn${appearance === 'dark' ? ' is-active' : ''}`}
        aria-pressed={appearance === 'dark'}
        title="Dark appearance"
      >
        <Moon className="h-3.5 w-3.5" />
        Dark
      </button>
    </div>
  );
}
