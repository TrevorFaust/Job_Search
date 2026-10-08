'use client';

import { useMemo, useState, useTransition } from 'react';
import { INTEREST_CATEGORIES } from '@/lib/categories';
import { deleteLearnedFact, deleteLlmApiKey, saveLlmApiKey, saveUserProfile } from '@/lib/profile-actions';
import type { LlmProvider } from '@/lib/llm-runtime';
import type {
  LearnedFact,
  ProfileJob,
  ProfileProject,
  ProfileSaveInput,
  UserProfilePublic,
} from '@/lib/user-profile';
import type { ResumeEducation, ResumeSkillGroup } from '@/lib/resume-template';

type Props = {
  token: string;
  profile: UserProfilePublic;
  isOwner: boolean;
};

const fieldClass =
  'mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 text-sm text-ink placeholder:text-ink-faint';

function emptyJob(): ProfileJob {
  return {
    company: '',
    locationDates: ', City, ST  (Dates)',
    locked: true,
    roles: [{ title: '', locked: false, includeByDefault: true, bullets: [{ text: '' }] }],
  };
}

function emptyProject(): ProfileProject {
  return {
    title: '',
    locked: false,
    includeByDefault: true,
    bullets: [{ text: '' }],
  };
}

export function UserProfileEditor({ token, profile, isOwner }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [location, setLocation] = useState(profile.location);
  const [relocate, setRelocate] = useState(profile.willing_to_relocate);
  const [email, setEmail] = useState(profile.contact_email);
  const [phone, setPhone] = useState(profile.phone);
  const [linkedinLabel, setLinkedinLabel] = useState(profile.linkedin_label);
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedin_url);
  const [githubLabel, setGithubLabel] = useState(profile.github_label);
  const [githubUrl, setGithubUrl] = useState(profile.github_url);
  const [websiteLabel, setWebsiteLabel] = useState(profile.website_label);
  const [websiteUrl, setWebsiteUrl] = useState(profile.website_url);
  const [education, setEducation] = useState<ResumeEducation>(profile.education);
  const [experience, setExperience] = useState<ProfileJob[]>(
    profile.experience.length ? profile.experience : [emptyJob()]
  );
  const [projects, setProjects] = useState<ProfileProject[]>(
    profile.projects.length ? profile.projects : [emptyProject()]
  );
  const [skills, setSkills] = useState<ResumeSkillGroup[]>(
    profile.skills.length
      ? profile.skills
      : [
          { heading: 'Tools', items: [] },
          { heading: 'Skills', items: [] },
        ]
  );
  const [projectsTitle, setProjectsTitle] = useState(profile.projects_section_title || 'PROJECTS');
  const [contextNotes, setContextNotes] = useState(profile.context_notes);
  const [categories, setCategories] = useState<string[]>(profile.preferred_categories);
  const [facts, setFacts] = useState<LearnedFact[]>(profile.learned_facts);
  const [provider, setProvider] = useState<LlmProvider>(profile.llm_provider ?? 'anthropic');
  const [model, setModel] = useState(profile.llm_model ?? '');
  const [apiKey, setApiKey] = useState('');

  const payload: ProfileSaveInput = useMemo(
    () => ({
      display_name: displayName,
      location,
      contact_email: email,
      phone,
      linkedin_label: linkedinLabel,
      linkedin_url: linkedinUrl,
      github_label: githubLabel,
      github_url: githubUrl,
      website_label: websiteLabel,
      website_url: websiteUrl,
      willing_to_relocate: relocate,
      education,
      experience: experience.filter((job) => job.company.trim()),
      projects: projects.filter((p) => p.title.trim()),
      skills: skills.map((g) => ({
        heading: g.heading,
        items: g.items.map((i) => i.trim()).filter(Boolean),
      })),
      projects_section_title: projectsTitle,
      context_notes: contextNotes,
      preferred_categories: categories,
    }),
    [
      displayName,
      location,
      email,
      phone,
      linkedinLabel,
      linkedinUrl,
      githubLabel,
      githubUrl,
      websiteLabel,
      websiteUrl,
      relocate,
      education,
      experience,
      projects,
      skills,
      projectsTitle,
      contextNotes,
      categories,
    ]
  );

  function saveProfile() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveUserProfile(token, payload);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function saveKey() {
    setError(null);
    startTransition(async () => {
      try {
        await saveLlmApiKey(token, provider, apiKey, model);
        setApiKey('');
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save API key');
      }
    });
  }

  return (
    <div className="space-y-10">
      <section id="profile" className="scroll-mt-8 space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
            Profile
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            Stationary facts used on every tailored resume and cover letter: name, school, jobs, projects.
            Tailoring rewrites bullets, not these labels.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <h3 className="text-sm font-medium text-ink-soft">Header</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-soft">Name</span>
              <input className={fieldClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Location</span>
              <input className={fieldClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Seattle, WA" />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Email on resume</span>
              <input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Phone</span>
              <input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">LinkedIn label</span>
              <input className={fieldClass} value={linkedinLabel} onChange={(e) => setLinkedinLabel(e.target.value)} placeholder="linkedin.com/in/you" />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">LinkedIn URL</span>
              <input className={fieldClass} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">GitHub label</span>
              <input className={fieldClass} value={githubLabel} onChange={(e) => setGithubLabel(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">GitHub URL</span>
              <input className={fieldClass} value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Website label</span>
              <input className={fieldClass} value={websiteLabel} onChange={(e) => setWebsiteLabel(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Website URL</span>
              <input className={fieldClass} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={relocate} onChange={(e) => setRelocate(e.target.checked)} className="rounded border-line" />
            Willing to relocate
          </label>
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <h3 className="text-sm font-medium text-ink-soft">Education</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-soft">School</span>
              <input className={fieldClass} value={education.schoolBold} onChange={(e) => setEducation({ ...education, schoolBold: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Campus / city</span>
              <input className={fieldClass} value={education.schoolRest} onChange={(e) => setEducation({ ...education, schoolRest: e.target.value })} placeholder=": State College, PA" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-ink-soft">Degree</span>
              <input className={fieldClass} value={education.degree} onChange={(e) => setEducation({ ...education, degree: e.target.value })} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-ink-soft">Minors / extras</span>
              <input className={fieldClass} value={education.minors} onChange={(e) => setEducation({ ...education, minors: e.target.value })} />
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-ink-soft">Jobs</h3>
            <button type="button" className="text-xs text-brand hover:text-brand" onClick={() => setExperience((prev) => [...prev, emptyJob()])}>
              Add job
            </button>
          </div>
          {experience.map((job, jobIndex) => (
            <div key={jobIndex} className="space-y-3 rounded-lg border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={fieldClass} value={job.company} placeholder="Company" onChange={(e) => {
                  const next = [...experience];
                  next[jobIndex] = { ...job, company: e.target.value };
                  setExperience(next);
                }} />
                <input className={fieldClass} value={job.locationDates} placeholder=", City, ST  (Dates)" onChange={(e) => {
                  const next = [...experience];
                  next[jobIndex] = { ...job, locationDates: e.target.value };
                  setExperience(next);
                }} />
              </div>
              {job.roles.map((role, roleIndex) => (
                <div key={roleIndex} className="space-y-2">
                  <input className={fieldClass} value={role.title} placeholder="Job title" onChange={(e) => {
                    const next = [...experience];
                    const roles = [...job.roles];
                    roles[roleIndex] = { ...role, title: e.target.value };
                    next[jobIndex] = { ...job, roles };
                    setExperience(next);
                  }} />
                  <textarea
                    className={`${fieldClass} font-mono`}
                    rows={3}
                    placeholder="Canonical bullets, one per line"
                    value={role.bullets.map((b) => b.text).join('\n')}
                    onChange={(e) => {
                      const next = [...experience];
                      const roles = [...job.roles];
                      roles[roleIndex] = {
                        ...role,
                        bullets: e.target.value.split('\n').map((text) => ({ text })),
                      };
                      next[jobIndex] = { ...job, roles };
                      setExperience(next);
                    }}
                  />
                </div>
              ))}
              <div className="flex gap-3">
                <button type="button" className="text-xs text-ink-soft hover:text-brand" onClick={() => {
                  const next = [...experience];
                  next[jobIndex] = {
                    ...job,
                    roles: [...job.roles, { title: '', includeByDefault: true, bullets: [{ text: '' }] }],
                  };
                  setExperience(next);
                }}>
                  Add title
                </button>
                <button type="button" className="text-xs text-ink-faint hover:text-red-700" onClick={() => setExperience(experience.filter((_, i) => i !== jobIndex))}>
                  Remove job
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-ink-soft">Projects</h3>
            <button type="button" className="text-xs text-brand hover:text-brand" onClick={() => setProjects((prev) => [...prev, emptyProject()])}>
              Add project
            </button>
          </div>
          <label className="block text-sm">
            <span className="text-ink-soft">Projects section title</span>
            <input className={fieldClass} value={projectsTitle} onChange={(e) => setProjectsTitle(e.target.value)} />
          </label>
          {projects.map((project, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-line p-3">
              <input className={fieldClass} value={project.title} placeholder="Project title" onChange={(e) => {
                const next = [...projects];
                next[index] = { ...project, title: e.target.value };
                setProjects(next);
              }} />
              <textarea
                className={`${fieldClass} font-mono`}
                rows={3}
                placeholder="Canonical bullets, one per line"
                value={project.bullets.map((b) => b.text).join('\n')}
                onChange={(e) => {
                  const next = [...projects];
                  next[index] = {
                    ...project,
                    bullets: e.target.value.split('\n').map((text) => ({ text })),
                  };
                  setProjects(next);
                }}
              />
              <button type="button" className="text-xs text-ink-faint hover:text-red-700" onClick={() => setProjects(projects.filter((_, i) => i !== index))}>
                Remove project
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <h3 className="text-sm font-medium text-ink-soft">Skills inventory</h3>
          {skills.slice(0, 2).map((group, index) => (
            <label key={index} className="block text-sm">
              <span className="text-ink-soft">{index === 0 ? 'Group 1 heading + tools' : 'Group 2 heading + tools'}</span>
              <input className={fieldClass} value={group.heading} onChange={(e) => {
                const next = [...skills];
                next[index] = { ...group, heading: e.target.value };
                setSkills(next);
              }} />
              <input
                className={`${fieldClass} mt-2`}
                value={group.items.join(' | ')}
                placeholder="Python | SQL | Power BI"
                onChange={(e) => {
                  const next = [...skills];
                  next[index] = {
                    ...group,
                    items: e.target.value.split('|').map((s) => s.trim()).filter(Boolean),
                  };
                  setSkills(next);
                }}
              />
            </label>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-paper p-5">
          <h3 className="text-sm font-medium text-ink-soft">Standing notes</h3>
          <p className="text-xs text-ink-faint">Always sent with tailoring. Career pivot, licenses, constraints, or anything you do not want to retype.</p>
          <textarea className={fieldClass} rows={5} value={contextNotes} onChange={(e) => setContextNotes(e.target.value)} />
        </div>

        {facts.length > 0 && (
          <div className="space-y-3 rounded-xl border border-line bg-paper p-5">
            <h3 className="text-sm font-medium text-ink-soft">Learned from your answers</h3>
            <p className="text-xs text-ink-faint">These accumulate as you tailor jobs. Remove anything that should not be reused.</p>
            <ul className="space-y-3">
              {facts.map((fact) => (
                <li key={fact.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs uppercase tracking-wide text-ink-faint">{fact.topic}</p>
                    <button
                      type="button"
                      className="text-xs text-ink-faint hover:text-red-700"
                      onClick={() => {
                        startTransition(async () => {
                          await deleteLearnedFact(token, fact.id);
                          setFacts((prev) => prev.filter((f) => f.id !== fact.id));
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{fact.answer}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section id="preferred" className="scroll-mt-8 space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
            Preferred jobs
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            These interest areas fill the Preferred tab. Uncheck anything you do not want there.
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-line bg-paper p-5 sm:grid-cols-2">
          {INTEREST_CATEGORIES.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="rounded border-line"
                checked={categories.includes(cat.id)}
                onChange={(e) => {
                  setCategories((prev) =>
                    e.target.checked ? [...prev, cat.id] : prev.filter((id) => id !== cat.id)
                  );
                }}
              />
              {cat.label}
            </label>
          ))}
        </div>
      </section>

      <section id="billing" className="scroll-mt-8 space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
            AI billing
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            Tailoring, ATS review, cover letters, and interview prep use the key you save here.
            {isOwner
              ? ' As the site owner you can keep using the server Anthropic key until you add your own.'
              : ' Other people cannot run charges on the owner account.'}
          </p>
        </div>
        <div className="space-y-4 rounded-xl border border-line bg-paper p-5">
          {profile.hasLlmKey ? (
            <p className="text-sm text-emerald-800">
              {profile.llm_provider === 'openai' ? 'OpenAI' : 'Anthropic'} key saved
              {profile.llm_api_key_last4 ? ` · …${profile.llm_api_key_last4}` : ''}.
            </p>
          ) : profile.usesOwnerLlm ? (
            <p className="text-sm text-ink-soft">Using the owner Anthropic key for now.</p>
          ) : (
            <p className="text-sm text-brand">Add a key before tailoring resumes.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-soft">Provider</span>
              <select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value as LlmProvider)}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (ChatGPT)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Model (optional)</span>
              <input className={fieldClass} value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6'} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-ink-soft">API key</span>
            <input
              className={fieldClass}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-… or sk-ant-…"
              autoComplete="new-password"
              name="llm-api-key"
            />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={saveKey} disabled={pending || !apiKey.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50">
              Save key
            </button>
            {profile.hasLlmKey && (
              <button
                type="button"
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:text-red-700"
                onClick={() => {
                  startTransition(async () => {
                    await deleteLlmApiKey(token);
                  });
                }}
              >
                Remove key
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={saveProfile}
          disabled={pending}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save profile'}
        </button>
        {saved && <span className="text-sm text-emerald-800">Saved.</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </div>
  );
}
