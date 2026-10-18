'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken, getStaffUser, type StaffUser } from './staff-session';

export function useRequireStaff(): { user: StaffUser | null; ready: boolean } {
  const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace('/staff/login');
      return;
    }
    setUser(getStaffUser());
    setReady(true);
  }, [router]);

  return { user, ready };
}
