import { withCandidateContext, withIdentityOnly } from './identity-context';
import type { Subscriber } from './queries';
import {
  getOrCreateUserProfile,
  resolveLlmRuntimeForUser,
  toCandidateIdentity,
} from './user-profile';

export async function withUserIdentity<T>(
  sub: Pick<Subscriber, 'id'>,
  fn: () => Promise<T>
): Promise<T> {
  const profile = await getOrCreateUserProfile(sub.id);
  return withIdentityOnly(toCandidateIdentity(profile), fn);
}

export async function withUserAi<T>(
  sub: Pick<Subscriber, 'id' | 'email'>,
  fn: () => Promise<T>
): Promise<T> {
  const [profile, llm] = await Promise.all([
    getOrCreateUserProfile(sub.id),
    resolveLlmRuntimeForUser(sub.id, sub.email),
  ]);
  return withCandidateContext(toCandidateIdentity(profile), llm, fn);
}
