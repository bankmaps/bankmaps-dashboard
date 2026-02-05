// app/users/page.tsx
import { Suspense } from 'react';
import ClientDashboard from './ClientDashboard';

export default function UsersPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading dashboard...</div>}>
      <ClientDashboard />
    </Suspense>
  );
}
