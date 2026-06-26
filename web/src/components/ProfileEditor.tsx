import type { SearchProfile } from '@/lib/queries';
import { deleteProfile, saveProfile } from '@/lib/actions';

type Props = {
  token: string;
  profiles: SearchProfile[];
};

function ProfileForm({ token, profile }: { token: string; profile?: SearchProfile }) {
  return (
    <form
      action={saveProfile.bind(null, token)}
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
    >
      {profile && <input type="hidden" name="id" value={profile.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-zinc-400">Profile name</span>
          <input
            name="name"
            defaultValue={profile?.name ?? ''}
            placeholder="Sports Analyst"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Email frequency</span>
          <select
            name="frequency"
            defaultValue={profile?.frequency ?? 'daily'}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          >
            <option value="daily">Daily</option>
            <option value="every_3_days">Every 3 days</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">Keywords (comma-separated)</span>
        <input
          name="keywords"
          defaultValue={profile?.keywords?.join(', ') ?? ''}
          placeholder="e.g. product manager, fintech"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          required
        />
        <span className="mt-1 block text-xs text-zinc-600">
          For digest email matching. The Preferred tab uses interest areas above.
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Exclude from title (comma-separated)</span>
        <input
          name="exclude_keywords"
          defaultValue={profile?.exclude_keywords?.join(', ') ?? ''}
          placeholder="engineer, developer"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Locations (comma-separated, leave blank for anywhere)</span>
        <input
          name="locations"
          defaultValue={profile?.locations?.join(', ') ?? ''}
          placeholder="Seattle, Remote"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-zinc-400">Min salary ($/year)</span>
          <input
            name="min_salary_annual"
            type="number"
            step="1000"
            defaultValue={profile?.min_salary_annual ?? ''}
            placeholder="60000"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-600">Hourly rates are converted: $15/hr → $28,800/yr</span>
        </label>
        <div className="flex flex-col justify-end gap-3 text-sm">
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              name="remote_only"
              value="on"
              defaultChecked={profile?.remote_only}
              className="rounded border-zinc-600"
            />
            Remote only
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              name="include_unknown_salary"
              value="on"
              defaultChecked={profile?.include_unknown_salary ?? true}
              className="rounded border-zinc-600"
            />
            Include jobs with no salary listed
          </label>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          {profile ? 'Save changes' : 'Add profile'}
        </button>
        {profile && (
          <button
            type="submit"
            formAction={deleteProfile.bind(null, token, profile.id)}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:border-red-800 hover:text-red-400"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

export function ProfileEditor({ token, profiles }: Props) {
  return (
    <div className="space-y-6">
      {profiles.map((p) => (
        <ProfileForm key={p.id} token={token} profile={p} />
      ))}
      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Add another hunt profile</h3>
        <ProfileForm token={token} />
      </div>
    </div>
  );
}
