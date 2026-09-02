'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import type { StoredFollowUpContacts, ManualFollowUpContactInput } from '@/lib/follow-up-utils';
import { textShowsEmploymentAtCompany, MAX_FOLLOW_UP_CONTACTS, sanitizeFollowUpEmailField } from '@/lib/follow-up-utils';
import {
  addManualFollowUpContact,
  clearFollowUpContactReachedOut,
  draftFollowUpContactMessages,
  generateFollowUpContactsForJob,
  markFollowUpContactReachedOut,
  removeFollowUpContact,
  updateFollowUpContactMessages,
} from '@/lib/follow-up-actions';
import type { DraftContactMessageOptions } from '@/lib/follow-up-actions';
import type { FollowUpContact, FollowUpContactChannel, FollowUpContactRole } from '@/lib/llm';
import { useInvalidateBoardCache } from '@/lib/board-cache';

type ProviderProps = {
  jobId?: number;
  manualJobId?: string;
  companyName?: string | null;
  initialContacts?: StoredFollowUpContacts | null;
  defaultExpanded?: boolean;
  children: ReactNode;
};

type TriggerVariant = 'sidebar' | 'default';

type FollowUpContactsContextValue = {
  jobId?: number;
  manualJobId?: string;
  companyName?: string | null;
  contacts: StoredFollowUpContacts | null;
  expanded: boolean;
  pending: boolean;
  error: string | null;
  info: string | null;
  hasContacts: boolean;
  setExpanded: (value: boolean) => void;
  handleGenerate: (options?: { refresh?: boolean; mergeExisting?: boolean }) => void;
  openPanel: () => void;
  markReachedOut: (
    contactId: string,
    channel: FollowUpContactChannel,
    notes?: string
  ) => void;
  clearReachedOut: (contactId: string) => void;
  addManualContact: (input: ManualFollowUpContactInput) => void;
  draftContactMessages: (contactId: string, options?: DraftContactMessageOptions) => void;
  updateContactMessages: (
    contactId: string,
    messages: { connection_note?: string; follow_up_message?: string }
  ) => void;
  removeManualContact: (contactId: string) => void;
  markingContactId: string | null;
  draftingContactId: string | null;
  savingContactId: string | null;
  addingContact: boolean;
};

const FollowUpContactsContext = createContext<FollowUpContactsContextValue | null>(null);

function useFollowUpContacts() {
  const ctx = useContext(FollowUpContactsContext);
  if (!ctx) {
    throw new Error('FollowUpContacts components must be used within FollowUpContactsProvider');
  }
  return ctx;
}

const ROLE_LABELS: Record<FollowUpContactRole, string> = {
  hiring_manager: 'Hiring manager',
  recruiter: 'Recruiter',
  team_lead: 'Team lead',
  other: 'Contact',
};

const CHANNEL_LABELS: Record<FollowUpContactChannel, string> = {
  linkedin: 'LinkedIn',
  email: 'Email',
  other: 'Other',
};

const CONFIDENCE_STYLES = {
  high: 'bg-emerald-400/10 text-emerald-300',
  medium: 'bg-amber-400/10 text-amber-300',
  low: 'bg-zinc-700/50 text-zinc-400',
} as const;

function formatGeneratedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatFollowUpDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function AddContactForm() {
  const { addManualContact, addingContact } = useFollowUpContacts();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [email, setEmail] = useState('');
  const [roleType, setRoleType] = useState<FollowUpContactRole>('other');
  const [notes, setNotes] = useState('');

  function reset() {
    setName('');
    setTitle('');
    setLinkedinUrl('');
    setEmail('');
    setRoleType('other');
    setNotes('');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
      >
        + Add contact manually
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Add a contact</p>
      <p className="mt-1 text-xs text-zinc-500">
        Paste someone you found on LinkedIn. At least a profile URL or email is required.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Software Engineer at BDGE)"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <input
          type="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="LinkedIn URL"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 sm:col-span-2"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <select
          value={roleType}
          onChange={(e) => setRoleType(e.target.value as FollowUpContactRole)}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note — why reach out to them?"
          rows={2}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 sm:col-span-2"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={addingContact}
          onClick={() => {
            addManualContact({
              name,
              title,
              linkedin_url: linkedinUrl || undefined,
              email: email || undefined,
              role_type: roleType,
              notes: notes || undefined,
            });
            reset();
            setOpen(false);
          }}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {addingContact ? 'Adding…' : 'Save contact'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ContactOutreachSection({ contact }: { contact: FollowUpContact }) {
  const { draftContactMessages, updateContactMessages, draftingContactId, savingContactId } =
    useFollowUpContacts();
  const [mode, setMode] = useState<'view' | 'edit' | 'draft' | 'refine'>('view');
  const [connectionNote, setConnectionNote] = useState(contact.connection_note ?? '');
  const [followUpMessage, setFollowUpMessage] = useState(contact.follow_up_message ?? '');
  const [promptText, setPromptText] = useState('');

  useEffect(() => {
    setConnectionNote(contact.connection_note ?? '');
    setFollowUpMessage(contact.follow_up_message ?? '');
  }, [contact.connection_note, contact.follow_up_message]);

  const hasMessages = !!(contact.connection_note?.trim() || contact.follow_up_message?.trim());
  const busy = draftingContactId === contact.id || savingContactId === contact.id;

  function syncFromContact() {
    setConnectionNote(contact.connection_note ?? '');
    setFollowUpMessage(contact.follow_up_message ?? '');
  }

  function closeMode() {
    setMode('view');
    setPromptText('');
    syncFromContact();
  }

  if (!hasMessages && mode === 'view') {
    return (
      <div className="mt-3 border-t border-zinc-800 pt-3">
        <button
          type="button"
          onClick={() => setMode('draft')}
          className="text-xs font-medium text-amber-400 hover:text-amber-300"
        >
          Draft a message
        </button>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Edit outreach</p>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor={`edit-note-${contact.id}`}>
            Connection note
          </label>
          <textarea
            id={`edit-note-${contact.id}`}
            value={connectionNote}
            onChange={(e) => setConnectionNote(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor={`edit-msg-${contact.id}`}>
            Follow-up message
          </label>
          <textarea
            id={`edit-msg-${contact.id}`}
            value={followUpMessage}
            onChange={(e) => setFollowUpMessage(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!contact.id || busy}
            onClick={() => {
              if (!contact.id) return;
              updateContactMessages(contact.id, {
                connection_note: connectionNote,
                follow_up_message: followUpMessage,
              });
              setMode('view');
            }}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {savingContactId === contact.id ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={closeMode} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'draft' || mode === 'refine') {
    return (
      <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {mode === 'refine' ? 'Refine with AI' : 'Draft a message'}
        </p>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={
            mode === 'refine'
              ? 'e.g. Shorter and less formal, mention my mock draft simulator, lead with curiosity about their product…'
              : 'e.g. We both went to Penn State, or I saw their post about fantasy football UX…'
          }
          rows={3}
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!contact.id || busy}
            onClick={() => {
              if (!contact.id) return;
              draftContactMessages(
                contact.id,
                mode === 'refine'
                  ? { revisionNotes: promptText || 'Polish and personalize further.' }
                  : { extraContext: promptText || undefined }
              );
              setMode('view');
              setPromptText('');
            }}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {draftingContactId === contact.id
              ? mode === 'refine'
                ? 'Refining…'
                : 'Drafting…'
              : mode === 'refine'
                ? 'Apply suggestions'
                : 'Generate message'}
          </button>
          <button type="button" onClick={closeMode} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Outreach for {contact.name.split(' ')[0]}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              syncFromContact();
              setMode('edit');
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('refine')}
            className="text-xs text-amber-400/90 hover:text-amber-300"
          >
            Refine with AI
          </button>
        </div>
      </div>

      {contact.connection_note?.trim() && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Connection note</p>
            <CopyButton text={contact.connection_note} label="Copy note" />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{contact.connection_note}</p>
        </div>
      )}

      {contact.follow_up_message?.trim() && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Follow-up message</p>
            <CopyButton text={contact.follow_up_message} label="Copy message" />
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {contact.follow_up_message}
          </p>
        </div>
      )}
    </div>
  );
}

function ContactCard({
  contact,
  companyName,
}: {
  contact: FollowUpContact;
  companyName?: string | null;
}) {
  const {
    markReachedOut,
    clearReachedOut,
    removeManualContact,
    markingContactId,
  } = useFollowUpContacts();
  const [channel, setChannel] = useState<FollowUpContactChannel>(
    contact.email ? 'email' : 'linkedin'
  );
  const [notes, setNotes] = useState('');
  const [showMarkForm, setShowMarkForm] = useState(false);

  const followedUp = !!contact.followed_up_at;
  const isManual = contact.source === 'manual';
  const verifiedAtCompany =
    !!companyName &&
    (textShowsEmploymentAtCompany(contact.title, companyName) ||
      (contact.company_evidence
        ? textShowsEmploymentAtCompany(contact.company_evidence, companyName)
        : false));
  const recruiterLabel =
    contact.role_type === 'recruiter' && verifiedAtCompany && companyName
      ? `Recruits for ${companyName}`
      : ROLE_LABELS[contact.role_type] ?? contact.role_type;

  return (
    <div
      className={`rounded-lg border p-4 ${
        followedUp ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-950/50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-100">{contact.name}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{contact.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManual && (
            <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
              Added by you
            </span>
          )}
          {verifiedAtCompany && companyName && (
            <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-300">
              Verified at {companyName}
            </span>
          )}
          <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
            {recruiterLabel}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CONFIDENCE_STYLES[contact.confidence]}`}
          >
            {contact.confidence}
          </span>
          {followedUp && (
            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              Followed up
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{contact.rationale}</p>

      {contact.company_evidence && verifiedAtCompany && (
        <p className="mt-2 text-xs italic text-zinc-500">
          &ldquo;{contact.company_evidence}&rdquo;
        </p>
      )}

      {contact.linkedin_url && (
        <a
          href={contact.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-sky-400 hover:text-sky-300"
        >
          View LinkedIn profile →
        </a>
      )}

      {contact.email && (
        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Suggested email
              {contact.email_confidence && (
                <span className="ml-2 normal-case text-zinc-600">
                  ({contact.email_confidence} confidence)
                </span>
              )}
            </p>
            <CopyButton text={contact.email} label="Copy email" />
          </div>
          <p className="mt-1 font-mono text-sm text-zinc-200">{contact.email}</p>
          {contact.email_pattern_note && (
            <p className="mt-1 text-xs text-zinc-500">{contact.email_pattern_note}</p>
          )}
          {contact.email_confidence === 'low' && (
            <p className="mt-1 text-xs text-amber-400/90">
              Verify before sending — pattern not fully confirmed.
            </p>
          )}
        </div>
      )}

      <ContactOutreachSection contact={contact} />

      {isManual && contact.id && (
        <button
          type="button"
          onClick={() => removeManualContact(contact.id!)}
          className="mt-2 text-xs text-red-400/80 hover:text-red-300"
        >
          Remove contact
        </button>
      )}

      {followedUp ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-emerald-300/90">
          <span>
            Followed up via {CHANNEL_LABELS[contact.follow_up_channel ?? 'other']} on{' '}
            {formatFollowUpDate(contact.followed_up_at!)}
          </span>
          {contact.follow_up_notes && (
            <span className="text-zinc-500">— {contact.follow_up_notes}</span>
          )}
          <button
            type="button"
            onClick={() => contact.id && clearReachedOut(contact.id)}
            className="text-zinc-500 hover:text-zinc-300"
          >
            Undo
          </button>
        </div>
      ) : (
        <div className="mt-3">
          {!showMarkForm ? (
            <button
              type="button"
              onClick={() => setShowMarkForm(true)}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              Mark as followed up
            </button>
          ) : (
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-zinc-500" htmlFor={`channel-${contact.id}`}>
                  Via
                </label>
                <select
                  id={`channel-${contact.id}`}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as FollowUpContactChannel)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note (e.g. sent connection request)"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!contact.id || markingContactId === contact.id}
                  onClick={() => {
                    if (!contact.id) return;
                    markReachedOut(contact.id, channel, notes || undefined);
                    setShowMarkForm(false);
                    setNotes('');
                  }}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {markingContactId === contact.id ? 'Saving…' : 'Confirm follow-up'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarkForm(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FollowUpContactsProvider({
  jobId,
  manualJobId,
  companyName = null,
  initialContacts = null,
  defaultExpanded = false,
  children,
}: ProviderProps) {
  const invalidateBoard = useInvalidateBoardCache();
  const [contacts, setContacts] = useState<StoredFollowUpContacts | null>(initialContacts);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [pending, startTransition] = useTransition();
  const [markingContactId, setMarkingContactId] = useState<string | null>(null);
  const [draftingContactId, setDraftingContactId] = useState<string | null>(null);
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setContacts((current) => {
      if (!initialContacts) {
        // Keep action results until the server page props catch up after revalidate.
        if (current?.contacts.length) return current;
        return null;
      }
      if (!current) return initialContacts;

      const initialTs = Date.parse(initialContacts.generated_at || '');
      const currentTs = Date.parse(current.generated_at || '');
      if (
        Number.isFinite(initialTs) &&
        Number.isFinite(currentTs) &&
        initialTs < currentTs
      ) {
        return current;
      }

      // Stale RSC payload can arrive with the same timestamp but contacts stripped.
      if (
        current.contacts.length > 0 &&
        initialContacts.contacts.length === 0 &&
        initialContacts.generated_at === current.generated_at
      ) {
        return current;
      }

      return initialContacts;
    });
  }, [initialContacts]);

  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

  function handleGenerate(options: { refresh?: boolean; mergeExisting?: boolean } = {}) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const result = await generateFollowUpContactsForJob(jobId, manualJobId, options);
        setContacts(result);
        setExpanded(true);
        if (result.no_new_contacts) {
          setInfo(
            `No additional verified ${companyName ?? 'company'} contacts were found. Try again later or add someone manually from LinkedIn.`
          );
        } else if ((result.contact_pool?.length ?? 0) > 0 && result.contacts.length <= 5) {
          setInfo(
            `${result.contact_pool!.length} more contact${result.contact_pool!.length === 1 ? '' : 's'} ranked and ready — use Find more when you want the next batch.`
          );
        }
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
      }
    });
  }

  function markReachedOut(
    contactId: string,
    channel: FollowUpContactChannel,
    notes?: string
  ) {
    setError(null);
    setMarkingContactId(contactId);
    startTransition(async () => {
      try {
        const result = await markFollowUpContactReachedOut(
          contactId,
          channel,
          jobId,
          manualJobId,
          notes
        );
        setContacts(result);
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save follow-up');
      } finally {
        setMarkingContactId(null);
      }
    });
  }

  function clearReachedOut(contactId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await clearFollowUpContactReachedOut(contactId, jobId, manualJobId);
        setContacts(result);
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not undo');
      }
    });
  }

  function addManualContact(input: ManualFollowUpContactInput) {
    setError(null);
    setInfo(null);
    setAddingContact(true);
    startTransition(async () => {
      try {
        const result = await addManualFollowUpContact(input, jobId, manualJobId);
        setContacts(result);
        setExpanded(true);
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add contact');
      } finally {
        setAddingContact(false);
      }
    });
  }

  function draftContactMessages(contactId: string, options: DraftContactMessageOptions = {}) {
    setError(null);
    setDraftingContactId(contactId);
    startTransition(async () => {
      try {
        const result = await draftFollowUpContactMessages(contactId, options, jobId, manualJobId);
        setContacts(result);
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not draft message');
      } finally {
        setDraftingContactId(null);
      }
    });
  }

  function updateContactMessages(
    contactId: string,
    messages: { connection_note?: string; follow_up_message?: string }
  ) {
    setError(null);
    setSavingContactId(contactId);
    startTransition(async () => {
      try {
        const result = await updateFollowUpContactMessages(
          contactId,
          messages,
          jobId,
          manualJobId
        );
        setContacts(result);
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save message');
      } finally {
        setSavingContactId(null);
      }
    });
  }

  function removeManualContact(contactId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeFollowUpContact(contactId, jobId, manualJobId);
        setContacts(result.contacts.length ? result : null);
        invalidateBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove contact');
      }
    });
  }

  function openPanel() {
    setExpanded(true);
  }

  const value: FollowUpContactsContextValue = {
    jobId,
    manualJobId,
    companyName,
    contacts,
    expanded,
    pending,
    error,
    info,
    hasContacts: !!contacts?.contacts.length,
    setExpanded,
    handleGenerate,
    openPanel,
    markReachedOut,
    clearReachedOut,
    addManualContact,
    draftContactMessages,
    updateContactMessages,
    removeManualContact,
    markingContactId,
    draftingContactId,
    savingContactId,
    addingContact,
  };

  return (
    <FollowUpContactsContext.Provider value={value}>{children}</FollowUpContactsContext.Provider>
  );
}

export function FollowUpContactsTrigger({ variant = 'default' }: { variant?: TriggerVariant }) {
  const { hasContacts, contacts, pending, expanded, handleGenerate, openPanel } =
    useFollowUpContacts();

  const followedUpCount = contacts?.contacts.filter((c) => c.followed_up_at).length ?? 0;

  if (expanded) return null;

  if (hasContacts) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className={
          variant === 'sidebar'
            ? 'text-xs font-medium text-sky-400 hover:text-sky-300'
            : 'rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400'
        }
      >
        View follow-up contacts ({contacts!.contacts.length}
        {followedUpCount > 0 ? ` · ${followedUpCount} done` : ''})
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => handleGenerate({ refresh: true })}
      disabled={pending}
      className={
        variant === 'sidebar'
          ? 'text-xs font-medium text-sky-400 hover:text-sky-300 disabled:opacity-50'
          : 'rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50'
      }
    >
      {pending ? 'Searching…' : 'Find follow-up contacts'}
    </button>
  );
}

export function FollowUpContactsExpanded({ variant = 'default' }: { variant?: TriggerVariant }) {
  const { contacts, companyName, expanded, pending, error, info, setExpanded, handleGenerate } =
    useFollowUpContacts();

  if (!expanded) return null;

  const isSidebar = variant === 'sidebar';
  const allFollowedUp =
    contacts?.contacts.length &&
    contacts.contacts.every((c) => c.followed_up_at);

  return (
    <div className={isSidebar ? 'mt-4' : 'mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5'}>
      {!isSidebar && (
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Follow-up contacts
        </h2>
      )}

      <div className={isSidebar ? '' : 'mt-4'}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleGenerate({ refresh: true, mergeExisting: false })}
              disabled={pending}
              className="rounded-lg border border-sky-500/40 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
            >
              {pending ? 'Searching…' : contacts ? 'Regenerate contacts' : 'Find follow-up contacts'}
            </button>
            {contacts ? (
              <button
                type="button"
                onClick={() => handleGenerate({ refresh: true, mergeExisting: true })}
                disabled={
                  pending ||
                  (contacts.contacts.length >= MAX_FOLLOW_UP_CONTACTS &&
                    !(contacts.contact_pool?.length ?? 0))
                }
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
              >
                Find more contacts
                {(contacts.contact_pool?.length ?? 0) > 0 ? (
                  <span className="ml-1 text-zinc-500">
                    ({contacts.contact_pool!.length} ready)
                  </span>
                ) : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Collapse
            </button>
            {contacts && (
              <span className="text-xs text-zinc-500">
                Generated {formatGeneratedAt(contacts.generated_at)}
              </span>
            )}
          </div>

          {contacts && (
            <p className="text-xs text-zinc-500">
              Shows up to 5 priority contacts first (recruiters and hiring managers). Find more
              reveals the next batch — teammates and secondary connections held until you ask.
              Regenerate replaces auto-discovered contacts; manual contacts are kept.
            </p>
          )}

          {pending && !contacts && (
            <p className="text-sm text-zinc-500">
              Searching for recruiters, hiring managers, and email patterns — usually 20–40 seconds.
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-amber-300/90">{info}</p>}

          {contacts && contacts.contacts.length > 0 && (
            <>
              {contacts.inherited_from_company ? (
                <p className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-3 py-2 text-sm text-sky-200">
                  Reused from your other {companyName ?? 'company'} application — same recruiters and
                  contacts apply across roles. Changes you make here save to this job only.
                </p>
              ) : null}

              {allFollowedUp ? (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
                  You&apos;ve followed up with everyone recommended for this role.
                </p>
              ) : null}

              {contacts.overview?.trim() ? (
                <p className="text-sm leading-relaxed text-zinc-300">{contacts.overview}</p>
              ) : null}

              {(() => {
                const domain = sanitizeFollowUpEmailField(contacts.company_email_domain);
                const pattern = sanitizeFollowUpEmailField(contacts.email_pattern);
                if (!domain && !pattern) return null;
                return (
                  <p className="text-xs text-zinc-500">
                    {pattern && domain
                      ? `Company email pattern: ${pattern}@${domain}`
                      : domain
                        ? `Likely email domain: @${domain}`
                        : null}
                  </p>
                );
              })()}

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Who to reach out to
                </p>
                {contacts.contacts.map((contact) => (
                  <ContactCard
                    key={contact.id ?? `${contact.name}-${contact.title}`}
                    contact={contact}
                    companyName={companyName}
                  />
                ))}
              </div>
            </>
          )}

          <div className="border-t border-zinc-800 pt-4">
            <AddContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
