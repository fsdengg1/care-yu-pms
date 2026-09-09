import { Outlet } from 'react-router-dom';
import '@/components/auth/auth.css';

export default function AuthLayout() {
  return <div className="auth-surface min-h-dvh antialiased"><Outlet /></div>;
}
