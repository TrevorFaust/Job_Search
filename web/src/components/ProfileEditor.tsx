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
      className="space-y-4 rounded-xl border border-line bg-paper p-5"
    >
      {profile && <input type="hidden" name="id" value={profile.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-soft">Profile name</span>
          <input
            name="name"
            defaultValue={profile?.name ?? ''}
            placeholder="Sports Analyst"
            className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-ink"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Email frequency</span>
          <select
            name="frequency"
            defaultValue={profile?.frequency ?? 'daily'}
            className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-ink"
          >
            <option value="daily">Daily</option>
            <option value="every_3_days">Every 3 days</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-soft">Keywords (comma-separated)</span>
        <input
          name="keywords"
          defaultValue={profile?.keywords?.join(', ') ?? ''}
          placeholder="e.g. product manager, fintech"
          className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-ink"
          required
        />
        <span className="mt-1 block text-xs text-ink-faint">
          For digest email matching. The Preferred tab uses interest areas above.
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-ink-soft">Exclude from title (comma-separated)</span>
        <input
          name="exclude_keywords"
          defaultValue={profile?.exclude_keywords?.join(', ') ?? ''}
          placeholder="engineer, developer"
          className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-ink"
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-soft">Locations (comma-separated, leave blank for anywhere)</span>
        <input
          name="locations"
          defaultValue={profile?.locations?.join(', ') ?? ''}
          placeholder="Seattle, Remote"
          className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-ink"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-soft">Min salary ($/year)</span>
          <input
            name="min_salary_annual"
            type="number"
            step="1000"
            defaultValue={profile?.min_salary_annual ?? ''}
            placeholder="60000"
            className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-ink"
          />
          <span className="mt-1 block text-xs text-ink-faint">Hourly rates are converted: $15/hr → $28,800/yr</span>
        </label>
        <div className="flex flex-col justify-end gap-3 text-sm">
          <label className="flex items-center gap-2 text-ink-soft">
            <input
              type="checkbox"
              name="remote_only"
              value="on"
              defaultChecked={profile?.remote_only}
              className="rounded border-line"
            />
            Remote only
          </label>
          <label className="flex items-center gap-2 text-ink-soft">
            <input
              type="checkbox"
              name="include_unknown_salary"
              value="on"
              defaultChecked={profile?.include_unknown_salary ?? true}
              className="rounded border-line"
            />
            Include jobs with no salary listed
          </label>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft"
        >
          {profile ? 'Save changes' : 'Add profile'}
        </button>
        {profile && (
          <button
            type="submit"
            formAction={deleteProfile.bind(null, token, profile.id)}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:border-red-400 hover:text-red-700"
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
        <h3 className="mb-3 text-sm font-medium text-ink-soft">Add another hunt profile</h3>
        <ProfileForm token={token} />
      </div>
    </div>
  );
}
