import { Outlet } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import '@/app/globals.css';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
