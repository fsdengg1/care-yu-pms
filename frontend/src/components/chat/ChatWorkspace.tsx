'use client';

import { useRouter, useSearchParams } from '@/lib/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ChatApi, ChatParticipant } from '@/lib/chatApi';
import { ChatMessage, ConversationSummary, ConversationType, User } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';
import { emitNotificationsChanged } from '@/lib/notificationPresentation';
import { messageTypeMeta } from '@/lib/messageTypes';
import MessageBubble from '@/components/chat/MessageBubble';
import MessageComposer from '@/components/chat/MessageComposer';
import ForumBoard from '@/components/forum/ForumBoard';
import { MessageSquare, MoreVertical, Plus, Search, Users, X } from 'lucide-react';

type Tab = 'direct' | 'group' | 'forum';

const TAB_TYPE: Record<Exclude<Tab, 'forum'>, ConversationType> = {
  direct: 'DIRECT',
  group: 'GROUP',
};

function tabFromParam(value: string | null, fallback: Tab): Tab {
  if (value === 'direct' || value === 'group' || value === 'forum') return value;
  if (value === 'DIRECT') return 'direct';
  if (value === 'GROUP') return 'group';
  if (value === 'ANNOUNCEMENT' || value === 'announcement') return 'forum';
  return fallback;
}

function matchesQuery(item: ConversationSummary, query: string) {
  if (!query.trim()) return true;
  const hay = [
    item.name,
    item.other_user_name,
    item.last_message,
    item.created_by,
    item.description,
    ...(item.participant_names || []),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(query.toLowerCase());
}

export default function ChatWorkspace({
  currentUser,
  mode = 'messages',
}: {
  currentUser: User;
  mode?: 'messages' | 'ceo';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab: Tab = mode === 'ceo' ? 'direct' : 'direct';
  const [tab, setTab] = useState<Tab>(tabFromParam(searchParams.get('tab'), defaultTab));
  const [query, setQuery] = useState('');
  const [directConversations, setDirectConversations] = useState<ConversationSummary[]>([]);
  const [groupConversations, setGroupConversations] = useState<ConversationSummary[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role_name: string; team_name?: string }>>([]);
  const [activeId, setActiveId] = useState(searchParams.get('conversation') || searchParams.get('c') || '');
  const [directMessages, setDirectMessages] = useState<ChatMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', memberQuery: '' });
  const [showGroup, setShowGroup] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<'info' | 'members' | 'add' | 'delete' | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ChatParticipant | null>(null);
  const [addSelection, setAddSelection] = useState<string[]>([]);

  const isCeo = currentUser.role_code === 'CEO' || mode === 'ceo';
  const expectedType = tab === 'forum' ? 'DIRECT' : TAB_TYPE[tab];
  const conversations = tab === 'direct' ? directConversations : groupConversations;
  const messages = tab === 'direct' ? directMessages : groupMessages;
  const active = tab === 'forum' ? undefined : conversations.find((item) => item.id === activeId && item.type === expectedType);
  const isGroupAdmin = participants.some((item) => item.user_id === currentUser.id && item.role === 'ADMIN');

  const loadLists = useCallback(async () => {
    const [direct, groups] = await Promise.all([ChatApi.list('DIRECT'), ChatApi.list('GROUP')]);
    setDirectConversations(direct.conversations.filter((item) => item.type === 'DIRECT'));
    setGroupConversations(groups.conversations.filter((item) => item.type === 'GROUP'));
    setEmployees(await ChatApi.employees(query));
  }, [query]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    const nextTab = tabFromParam(searchParams.get('tab'), tab);
    const nextId = searchParams.get('conversation') || searchParams.get('c') || '';
    setTab(nextTab);
    setActiveId(nextId);
  }, [searchParams]);

  useEffect(() => {
    if (tab === 'forum') return;
    if (!activeId) {
      if (tab === 'direct') setDirectMessages([]);
      if (tab === 'group') setGroupMessages([]);
      setParticipants([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await ChatApi.get(activeId, expectedType);
      if (cancelled) return;
      if (!result.ok || result.data.conversation.type !== expectedType) {
        setError(result.ok ? 'This conversation does not belong to the current section.' : result.message);
        if (tab === 'direct') setDirectMessages([]);
        if (tab === 'group') setGroupMessages([]);
        setParticipants([]);
        return;
      }
      setError(null);
      const scoped = result.data.messages.filter(
        (item) => item.conversation_id === activeId && (!item.conversation_type || item.conversation_type === expectedType)
      );
      if (tab === 'direct') setDirectMessages(scoped);
      if (tab === 'group') setGroupMessages(scoped);
      setParticipants(result.data.participants);
      emitNotificationsChanged();
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, expectedType, tab]);

  const visibleEmployees = useMemo(
    () => employees.filter((item) => item.id !== currentUser.id && item.name.toLowerCase().includes(query.toLowerCase())),
    [employees, query, currentUser.id]
  );

  const activeDirect = useMemo(
    () => directConversations.filter((item) => Boolean(item.last_message)),
    [directConversations]
  );

  const startEmployees = useMemo(() => {
    const inChat = new Set(activeDirect.map((item) => item.other_user_id).filter(Boolean));
    return visibleEmployees.filter((item) => !inChat.has(item.id));
  }, [visibleEmployees, activeDirect]);

  const title =
    active?.name ||
    active?.other_user_name ||
    (tab === 'direct' ? (isCeo ? 'CEO Chat' : 'Direct') : 'Groups');

  const replaceUrl = (nextTab: Tab, conversationId?: string) => {
    const params = new URLSearchParams();
    params.set('tab', nextTab);
    if (conversationId) {
      params.set('conversation', conversationId);
      params.set('c', conversationId);
    }
    router.replace(`?${params.toString()}`);
  };

  const switchTab = (next: Tab) => {
    setError(null);
    setMenuOpen(false);
    setPanel(null);
    setTab(next);
    if (next === 'forum') {
      setActiveId('');
      setDirectMessages([]);
      setGroupMessages([]);
      replaceUrl('forum');
      return;
    }
    const keep = conversations.find((item) => item.id === activeId && TAB_TYPE[next] === item.type);
    const nextId = keep ? activeId : '';
    setActiveId(nextId);
    if (next !== 'direct') setDirectMessages([]);
    if (next !== 'group') setGroupMessages([]);
    replaceUrl(next, nextId || undefined);
  };

  const openConversation = (id: string, conversationType: ConversationType) => {
    if (tab === 'forum' || TAB_TYPE[tab] !== conversationType) return;
    setError(null);
    setMenuOpen(false);
    setPanel(null);
    setActiveId(id);
    replaceUrl(tab, id);
  };

  const startDirect = async (userId: string) => {
    const result = await ChatApi.startDirect(userId);
    if (!result.ok || result.data.conversation.type !== 'DIRECT') {
      setError(result.ok ? 'Unable to open a direct conversation.' : result.message);
      return;
    }
    setTab('direct');
    await loadLists();
    setActiveId(result.data.conversation.id);
    replaceUrl('direct', result.data.conversation.id);
  };

  const appendMessage = (next: ChatMessage) => {
    if (tab === 'direct') setDirectMessages((current) => [...current, next]);
    if (tab === 'group') setGroupMessages((current) => [...current, next]);
    void loadLists();
    emitNotificationsChanged();
  };

  const refreshActive = async () => {
    if (!activeId) return;
    const result = await ChatApi.get(activeId, expectedType);
    if (result.ok && result.data.conversation.type === expectedType) {
      setParticipants(result.data.participants);
      const scoped = result.data.messages.filter(
        (item) => item.conversation_id === activeId && (!item.conversation_type || item.conversation_type === expectedType)
      );
      if (tab === 'group') setGroupMessages(scoped);
    }
    await loadLists();
  };

  const addMembers = async () => {
    if (!activeId || !addSelection.length) return;
    const result = await ChatApi.updateMembers(activeId, { add: addSelection });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAddSelection([]);
    setPanel('members');
    await refreshActive();
  };

  const confirmRemove = async () => {
    if (!activeId || !removeTarget) return;
    const result = await ChatApi.updateMembers(activeId, { remove: [removeTarget.user_id] });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRemoveTarget(null);
    await refreshActive();
  };

  const confirmDelete = async () => {
    if (!activeId) return;
    const result = await ChatApi.deleteConversation(activeId);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPanel(null);
    setActiveId('');
    replaceUrl(tab);
    await loadLists();
  };

  const memberCandidates = employees.filter((item) => !participants.some((row) => row.user_id === item.id));

  if (tab === 'forum') {
    return <ForumBoard currentUser={currentUser} isCeo={isCeo} onSwitchTab={switchTab} onOpenDirect={(userId) => void startDirect(userId)} />;
  }

  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-950 p-1 text-[11px]">
          {(['direct', 'group', 'forum'] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => switchTab(item)}
              className={`flex-1 rounded-md px-2 py-1.5 font-semibold capitalize ${
                tab === item ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item === 'forum' ? 'Forum' : item === 'group' ? 'Groups' : isCeo ? 'CEO Chat' : 'Direct'}
            </button>
          ))}
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'direct' ? 'Search employees...' : 'Search groups...'}
            className="w-full rounded-md border border-slate-800 bg-slate-950 py-2 pl-8 pr-3 text-xs text-slate-200"
          />
        </div>
        {tab === 'group' && (
          <button onClick={() => setShowGroup(true)} className="mb-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-700 px-2 py-1.5 text-[11px] font-semibold text-slate-200">
            <Plus className="h-3 w-3" /> New Group
          </button>
        )}
        <div className="max-h-[58vh] space-y-1 overflow-y-auto">
          {tab === 'direct' && (
            <>
              {activeDirect.length > 0 && (
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Conversations</div>
              )}
              {activeDirect.filter((item) => matchesQuery(item, query)).map((item) => {
                const meta = messageTypeMeta(item.last_message_type);
                const Icon = meta.Icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => openConversation(item.id, 'DIRECT')}
                    className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                      item.id === activeId ? 'bg-cyan-950/60 text-cyan-200' : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{item.other_user_name || 'Conversation'}</span>
                      {item.unread_count > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                    </div>
                    <div className="text-[10px] text-slate-500">{item.other_user_role || 'Direct'}</div>
                    {item.last_message && (
                      <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                        <Icon className={`h-3 w-3 ${meta.iconClass}`} />
                        {item.last_message}
                      </div>
                    )}
                    {item.last_message_at && <div className="text-[10px] text-slate-600">{formatRelativeTime(item.last_message_at)}</div>}
                  </button>
                );
              })}
              <div className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {isCeo ? 'Employee List' : 'Start a conversation'}
              </div>
              {startEmployees.map((employee) => (
                  <button
                    key={employee.id}
                    onClick={() => void startDirect(employee.id)}
                    className="w-full rounded-md px-2 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <div className="font-semibold">{employee.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {employee.role_name}
                      {employee.team_name ? ` • ${employee.team_name}` : ''}
                    </div>
                  </button>
              ))}
            </>
          )}
          {tab === 'group' &&
            groupConversations.filter((item) => matchesQuery(item, query)).map((item) => {
              const meta = messageTypeMeta(item.last_message_type);
              const Icon = meta.Icon;
              return (
                <button
                  key={item.id}
                  onClick={() => openConversation(item.id, 'GROUP')}
                  className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                    item.id === activeId ? 'bg-cyan-950/60 text-cyan-200' : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
                      <Users className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span className="truncate">{item.name || 'Group'}</span>
                    </span>
                    {item.unread_count > 0 && (
                      <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{item.unread_count}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">{item.member_count || 0} members</div>
                  {item.last_message && (
                    <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                      <Icon className={`h-3 w-3 ${meta.iconClass}`} />
                      {item.last_message}
                    </div>
                  )}
                  {item.last_message_at && <div className="text-[10px] text-slate-600">{formatRelativeTime(item.last_message_at)}</div>}
                </button>
              );
            })}
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              {tab === 'group' ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              {active ? title : tab === 'direct' ? (isCeo ? 'CEO Chat' : 'Direct') : 'Groups'}
            </div>
            {active && tab === 'group' && (
              <button type="button" onClick={() => setPanel('info')} className="mt-1 text-[11px] text-slate-400 hover:text-cyan-300">
                {participants.length || active.member_count || 0} members
              </button>
            )}
          </div>
          {active && tab === 'group' && (
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Group menu">
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-800 bg-slate-950 py-1 shadow-xl">
                  <button type="button" onClick={() => { setMenuOpen(false); setPanel('info'); }} className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">Group Info</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setPanel('members'); }} className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">View Members</button>
                  {isGroupAdmin && (
                    <>
                      <button type="button" onClick={() => { setMenuOpen(false); setPanel('add'); }} className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">Add Members</button>
                      <button type="button" onClick={() => { setMenuOpen(false); setPanel('delete'); }} className="block w-full px-3 py-1.5 text-left text-[11px] text-rose-300 hover:bg-rose-950">Delete Group</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {error && <div className="mx-4 mt-3 rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!active && <p className="text-sm text-slate-500">Select a conversation in this section to begin.</p>}
          {active &&
            messages
              .filter((item) => item.conversation_id === active.id && (!item.conversation_type || item.conversation_type === expectedType))
              .map((item) => <MessageBubble key={item.id} item={item} currentUser={currentUser} />)}
        </div>
        {active && active.type === expectedType && (
          <MessageComposer
            conversationId={active.id}
            expectedType={expectedType}
            allowAttachments
            onSent={appendMessage}
            onError={setError}
          />
        )}
      </section>

      {showGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">Create New Group</h3>
              <button type="button" onClick={() => setShowGroup(false)} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <label className="mt-3 block text-[11px] font-semibold text-slate-400">Group Name</label>
            <input value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <label className="mt-3 block text-[11px] font-semibold text-slate-400">Description</label>
            <textarea value={groupForm.description} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })} rows={2} className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <label className="mt-3 block text-[11px] font-semibold text-slate-400">Add Members</label>
            <input value={groupForm.memberQuery} onChange={(event) => setGroupForm({ ...groupForm, memberQuery: event.target.value })} placeholder="Search employees..." className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {employees.filter((item) => item.name.toLowerCase().includes(groupForm.memberQuery.toLowerCase())).map((employee) => (
                <label key={employee.id} className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(employee.id)}
                    onChange={(event) => {
                      setSelectedMembers((current) =>
                        event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id)
                      );
                    }}
                  />
                  <span>
                    {employee.name}
                    <span className="ml-1 text-[10px] text-slate-500">{employee.role_name}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowGroup(false)} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
              <button
                onClick={async () => {
                  const result = await ChatApi.createGroup({ name: groupForm.name, description: groupForm.description, member_ids: selectedMembers });
                  if (!result.ok || result.data.conversation.type !== 'GROUP') {
                    setError(result.ok ? 'Unable to create group.' : result.message);
                    return;
                  }
                  setShowGroup(false);
                  setGroupForm({ name: '', description: '', memberQuery: '' });
                  setSelectedMembers([]);
                  setTab('group');
                  await loadLists();
                  setActiveId(result.data.conversation.id);
                  replaceUrl('group', result.data.conversation.id);
                }}
                className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'info' && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">Group Info</h3>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="mt-3 text-sm font-bold text-slate-100">{active.name}</div>
            <div className="mt-2 space-y-1 text-slate-400">
              <div>Created by: {active.created_by}</div>
              <div>Members: {participants.length}</div>
              <div>Created: {new Date(active.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              {active.description && <div>Description: {active.description}</div>}
            </div>
            {isGroupAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setPanel('add')} className="rounded border border-slate-700 px-3 py-1.5">Add Members</button>
                <button type="button" onClick={() => setPanel('members')} className="rounded border border-slate-700 px-3 py-1.5">Remove Members</button>
                <button type="button" onClick={() => setPanel('delete')} className="rounded border border-rose-800 px-3 py-1.5 text-rose-300">Delete Group</button>
              </div>
            )}
          </div>
        </div>
      )}

      {(panel === 'members' || panel === 'add') && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">{panel === 'add' ? 'Add Members' : active.name}</h3>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            {panel === 'members' && (
              <>
                <div className="mt-2 text-[11px] text-slate-400">Members ({participants.length})</div>
                {isGroupAdmin && (
                  <button type="button" onClick={() => setPanel('add')} className="mt-2 text-[11px] font-bold text-cyan-400">+ Add Members</button>
                )}
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {participants.map((member) => (
                    <div key={member.user_id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <div>
                        <div className="font-semibold text-slate-100">{member.name}{member.is_owner ? ' · Owner' : ''}</div>
                        <div className="text-[10px] text-slate-500">{member.role_name}{member.team_name ? ` · ${member.team_name}` : ''}</div>
                      </div>
                      {isGroupAdmin && !member.is_owner && member.user_id !== currentUser.id && (
                        <button type="button" onClick={() => setRemoveTarget(member)} className="text-[11px] font-bold text-rose-300">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {panel === 'add' && (
              <>
                <input value={groupForm.memberQuery} onChange={(event) => setGroupForm({ ...groupForm, memberQuery: event.target.value })} placeholder="Search employees..." className="mt-3 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
                <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                  {memberCandidates.filter((item) => item.name.toLowerCase().includes(groupForm.memberQuery.toLowerCase())).map((employee) => (
                    <label key={employee.id} className="flex items-center gap-2 text-slate-300">
                      <input
                        type="checkbox"
                        checked={addSelection.includes(employee.id)}
                        onChange={(event) => setAddSelection((current) => event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))}
                      />
                      {employee.name}
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setPanel('members')} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
                  <button type="button" onClick={() => void addMembers()} className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white">Add</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {removeTarget && active && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
            <h3 className="text-sm font-bold text-slate-100">Remove member?</h3>
            <p className="mt-2 text-slate-400">Are you sure you want to remove {removeTarget.name} from {active.name}?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRemoveTarget(null)} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
              <button type="button" onClick={() => void confirmRemove()} className="rounded bg-rose-600 px-3 py-1.5 font-bold text-white">Remove Member</button>
            </div>
          </div>
        </div>
      )}

      {panel === 'delete' && active && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-rose-900 bg-slate-900 p-4 text-xs">
            <h3 className="text-sm font-bold text-rose-200">Delete Group?</h3>
            <p className="mt-2 text-slate-400">Are you sure you want to permanently delete “{active.name}”? This will remove the group from all members&apos; group lists.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPanel(null)} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} className="rounded bg-rose-600 px-3 py-1.5 font-bold text-white">Delete Group</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
