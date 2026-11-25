import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PasswordDialog from './PasswordDialog';

/**
 * Once, after someone signs in with an email link, offer to create a password.
 * Not shown to Google sign-ins, to anyone who already has one, or again after "Not now" on this device.
 */
export default function PasswordPrompt() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const user = session?.user;
  const key = user ? `gh.pwprompt.${user.id}` : '';

  useEffect(() => {
    if (!user || pathname.startsWith('/site/') || pathname.startsWith('/reset-password')) return;
    const providers: string[] = (user.app_metadata?.providers as string[]) ?? [user.app_metadata?.provider as string];
    const viaGoogleOnly = providers.includes('google') && !providers.includes('email');
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(key); } catch { /* private mode */ }
    if (!user.user_metadata?.has_password && !viaGoogleOnly && !dismissed) {
      const t = setTimeout(() => setOpen(true), 1200);   // let the app finish loading first
      return () => clearTimeout(t);
    }
  }, [user, key, pathname]);

  return <PasswordDialog open={open} first onClose={() => { setOpen(false); try { localStorage.setItem(key, '1'); } catch { /* private mode */ } }} />;
}
