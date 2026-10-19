import { AuthShell } from '@/components/auth-shell';
import { SignInBox } from '@/components/sign-in-box';

export default function Page() {
  return (
    <AuthShell>
      <SignInBox />
    </AuthShell>
  );
}
