'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getDb } from './supabase';
import { getOrCreateSubscriber, getSubscriberByToken } from './queries';

const COOKIE_NAME = 'jh_token';

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Enter a valid email');
  const sub = await getOrCreateSubscriber(email);
  const jar = await cookies();
  jar.set(COOKIE_NAME, sub.edit_token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  redirect('/');
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  redirect('/');
}

export async function saveProfile(token: string, formData: FormData) {
  const sub = await getSubscriberByToken(token);
  if (!sub) throw new Error('Invalid link');

  const id = formData.get('id') as string | null;
  const keywords = String(formData.get('keywords') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const exclude_keywords = String(formData.get('exclude_keywords') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const locations = String(formData.get('locations') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const row = {
    subscriber_id: sub.id,
    name: String(formData.get('name') ?? 'Profile').trim() || 'Profile',
    keywords,
    exclude_keywords,
    locations,
    remote_only: formData.get('remote_only') === 'on',
    min_salary_annual: formData.get('min_salary_annual')
      ? Number(formData.get('min_salary_annual'))
      : null,
    include_unknown_salary: formData.get('include_unknown_salary') === 'on',
    frequency: (formData.get('frequency') as string) || 'daily',
    active: true,
  };

  const db = getDb();
  if (id) {
    const { error } = await db.from('search_profiles').update(row).eq('id', id).eq('subscriber_id', sub.id);
    if (error) throw error;
  } else {
    const { error } = await db.from('search_profiles').insert(row);
    if (error) throw error;
  }

  revalidatePath(`/settings/${token}`);
  revalidatePath('/');
}

export async function deleteProfile(token: string, profileId: string) {
  const sub = await getSubscriberByToken(token);
  if (!sub) throw new Error('Invalid link');
  const { error } = await getDb()
    .from('search_profiles')
    .update({ active: false })
    .eq('id', profileId)
    .eq('subscriber_id', sub.id);
  if (error) throw error;
  revalidatePath(`/settings/${token}`);
  revalidatePath('/');
}
