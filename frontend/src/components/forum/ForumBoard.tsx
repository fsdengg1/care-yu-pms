'use client';

import { useRouter, useSearchParams } from '@/lib/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ArrowLeft,
  HelpCircle,
  Lightbulb,
  Lock,
  MessageCircle,
  MessagesSquare,
  MoreVertical,
  Paperclip,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { DocumentsApi } from '@/lib/documentsApi';
import { ForumApi } from '@/lib/forumApi';
import {
  FORUM_CATEGORY_OPTIONS,
  FORUM_REACTION_OPTIONS,
  FORUM_THREAD_KIND_OPTIONS,
  formatForumDate,
  formatForumDateLong,
  forumCategoryLabel,
  forumFileIcon,
  forumFileKind,
  forumFileLabel,
  forumThreadKind,
  forumThreadKindLabel,
  stripHtml,
} from '@/lib/forumPresentation';
import { ACCEPT_FILE_INPUT, fileTypeError, formatFileSize, isAllowedFileType, MAX_FILE_SIZE } from '@/lib/fileConfig';
import { NOTIFICATIONS_CHANGED_EVENT, emitNotificationsChanged } from '@/lib/notificationPresentation';
import { canModerateForum } from '@/lib/rbac';
import {
  EntityDocument,
  ForumCategory,
  ForumCommentView,
  ForumPostDetail,
  ForumPostSummary,
  ForumReactionKind,
  ForumThreadKind,
  User,
} from '@/lib/types';
import ForumRichEditor from '@/components/forum/ForumRichEditor';
import ForumLiveChat from '@/components/forum/ForumLiveChat';

type Tab = 'direct' | 'group' | 'forum';
type PendingFile = { key: string; file: File; progress: number; preview?: string; error?: string };

function readFile(file: File, onProgress?: (pct: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 90));
    };
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function matchesPost(post: ForumPostSummary, query: string, category: string, tag: string, kind: string) {
  if (kind && forumThreadKind(post.thread_kind) !== kind) return false;
  if (category && post.category !== category) return false;
  if (tag && !post.tags.includes(tag)) return false;
  if (!query.trim()) return true;
  const hay = `${post.title} ${post.body_text} ${post.author_name} ${forumCategoryLabel(post.category)} ${forumThreadKindLabel(post.thread_kind)} ${post.tags.join(' ')} ${post.last_reply_author || ''}`.toLowerCase();
  return hay.includes(query.trim().toLowerCase());
}

function ThreadKindBadge({ kind }: { kind?: string }) {
  const value = forumThreadKind(kind);
  const label = forumThreadKindLabel(value);
  if (value === 'QUESTION') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-800 bg-sky-950/50 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
        <HelpCircle className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (value === 'IDEA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
        <Lightbulb className="h-3 w-3" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
      <MessagesSquare className="h-3 w-3" /> {label}
    </span>
  );
}

function AttachmentGlyph({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  const { Icon, className: color } = forumFileIcon(name);
  return <Icon className={`${className} ${color}`} />;
}

function ReactionBar({
  counts,
  mine,
  onToggle,
  compact,
}: {
  counts: Partial<Record<ForumReactionKind, number>>;
  mine: ForumReactionKind[];
  onToggle: (kind: ForumReactionKind) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {FORUM_REACTION_OPTIONS.map((item) => {
        const count = counts[item.kind] || 0;
        const active = mine.includes(item.kind);
        if (compact && !count && item.kind !== 'LIKE') return null;
        return (
          <button
            key={item.kind}
            type="button"
            onClick={() => onToggle(item.kind)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              active ? 'border-cyan-700 bg-cyan-950/70 text-cyan-200' : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
            aria-label={item.label}
          >
            <span>{item.emoji}</span>
            {(count > 0 || !compact) && <span>{compact ? count : count || item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function FilePreview({ doc }: { doc: EntityDocument }) {
  const [url, setUrl] = useState<string | undefined>(doc.file_url);
  const kind = forumFileKind(doc.file_name);
  useEffect(() => {
    let cancelled = false;
    void DocumentsApi.file(doc.id).then((result) => {
      if (!cancelled && result.ok) setUrl(result.data.document.file_url);
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);
  if (kind === 'IMAGE' && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={doc.original_file_name || doc.file_name} className="max-h-56 w-full object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 hover:border-cyan-800"
    >
      <AttachmentGlyph name={doc.file_name} />
      <span className="min-w-0 truncate font-semibold">{doc.original_file_name || doc.file_name}</span>
      <span className="shrink-0 text-[10px] text-slate-500">{doc.file_size}</span>
    </a>
  );
}

function PendingList({
  files,
  onRemove,
}: {
  files: PendingFile[];
  onRemove: (key: string) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {files.map((item) => (
        <div key={item.key} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <AttachmentGlyph name={item.file.name} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-100">{item.file.name}</div>
                <div className="text-[10px] text-slate-500">{formatFileSize(item.file.size)}</div>
              </div>
            </div>
            <button type="button" onClick={() => onRemove(item.key)} className="text-slate-500 hover:text-rose-300" aria-label="Remove file">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {item.preview && forumFileKind(item.file.name) === 'IMAGE' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.preview} alt="" className="mt-2 max-h-28 rounded-md object-cover" />
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-cyan-500" style={{ width: `${item.progress}%` }} />
          </div>
          {item.error && <div className="mt-1 text-[11px] text-rose-300">{item.error}</div>}
        </div>
      ))}
    </div>
  );
}

function DropZone({
  onFiles,
  compact,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
      className={`rounded-md border border-dashed px-3 py-3 text-center ${over ? 'border-cyan-500 bg-cyan-950/20' : 'border-slate-700 bg-slate-950/40'}`}
    >
      <Paperclip className="mx-auto h-4 w-4 text-cyan-400" />
      <div className="mt-1 text-[11px] text-slate-400">{compact ? 'Attach files' : 'Drag & drop files here, or browse'}</div>
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-1 text-[11px] font-bold text-cyan-400">
        Browse
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_FILE_INPUT}
        className="hidden"
        onChange={(event) => {
          onFiles(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
    </div>
  );
}

export default function ForumBoard({
  currentUser,
  isCeo,
  onSwitchTab,
  onOpenDirect,
}: {
  currentUser: User;
  isCeo: boolean;
  onSwitchTab: (tab: Tab) => void;
  onOpenDirect?: (userId: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get('post') || '';
  const liveView = searchParams.get('view') === 'live';
  const canModerate = canModerateForum(currentUser);

  const [posts, setPosts] = useState<ForumPostSummary[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [threadKind, setThreadKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ForumPostDetail | null>(null);
  const [comments, setComments] = useState<ForumCommentView[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<ForumPostSummary | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'post' | 'comment'; id: string; title: string } | null>(null);
  const [reply, setReply] = useState('');
  const [replyParent, setReplyParent] = useState<string | undefined>();
  const [replyFiles, setReplyFiles] = useState<PendingFile[]>([]);
  const [posting, setPosting] = useState(false);
  const [editCommentId, setEditCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [activeCount, setActiveCount] = useState(0);

  const setForumUrl = (opts?: { post?: string; live?: boolean }) => {
    const params = new URLSearchParams();
    params.set('tab', 'forum');
    if (opts?.live) params.set('view', 'live');
    else if (opts?.post) params.set('post', opts.post);
    router.replace(`?${params.toString()}`);
  };

  const setPostUrl = (id?: string) => setForumUrl(id ? { post: id } : undefined);

  const loadPosts = useCallback(async () => {
    const result = await ForumApi.list();
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setError(null);
    setPosts(result.posts);
    setTags(result.tags);
    return true;
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const result = await ForumApi.get(id);
    setDetailLoading(false);
    if (!result.ok) {
      setError(result.message);
      setDetail(null);
      setComments([]);
      return;
    }
    setError(null);
    setDetail(result.data.post);
    setComments(result.data.comments);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadPosts().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadPosts]);

  useEffect(() => {
    if (!postId || liveView) {
      setDetail(null);
      setComments([]);
      return;
    }
    void loadDetail(postId);
  }, [postId, liveView, loadDetail]);

  useEffect(() => {
    const refresh = () => {
      void loadPosts();
      if (postId && !liveView) void loadDetail(postId);
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [loadPosts, loadDetail, postId, liveView]);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const result = await ForumApi.heartbeat();
      if (cancelled || !result.ok) return;
      setActiveCount(result.data.active_count);
    };
    void ping();
    const timer = window.setInterval(() => void ping(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visible = useMemo(
    () => posts.filter((item) => matchesPost(item, query, category, tag, threadKind)),
    [posts, query, category, tag, threadKind]
  );
  const pinned = visible.filter((item) => item.pinned);
  const recent = visible.filter((item) => !item.pinned);
  const tagOptions = useMemo(() => [...new Set([...tags, ...posts.flatMap((item) => item.tags)])].sort(), [tags, posts]);

  const queueFiles = (incoming: File[], setter: React.Dispatch<React.SetStateAction<PendingFile[]>>) => {
    incoming.forEach((file) => {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      if (!isAllowedFileType(file.name) || file.size > MAX_FILE_SIZE) {
        setter((current) => [...current, { key, file, progress: 0, error: fileTypeError() }]);
        return;
      }
      setter((current) => [...current, { key, file, progress: 8 }]);
      void readFile(file, (pct) => {
        setter((current) => current.map((item) => (item.key === key ? { ...item, progress: pct } : item)));
      }).then((preview) => {
        setter((current) => current.map((item) => (item.key === key ? { ...item, progress: 100, preview } : item)));
      });
    });
  };

  const uploadPending = async (target: 'posts' | 'comments', id: string, files: PendingFile[]) => {
    for (const item of files) {
      if (item.error) continue;
      const dataUrl = item.preview || (await readFile(item.file));
      const attached = await ForumApi.attach(target, id, {
        file_name: item.file.name,
        original_file_name: item.file.name,
        file_type: forumFileLabel(item.file.name),
        file_size: formatFileSize(item.file.size),
        file_url: dataUrl,
        mime_type: item.file.type,
        size_bytes: item.file.size,
      });
      if (!attached.ok) throw new Error(attached.message);
    }
  };

  const openPost = (id: string) => {
    setMenuId(null);
    setPostUrl(id);
  };

  const togglePostReaction = async (id: string, kind: ForumReactionKind) => {
    const result = await ForumApi.reactPost(id, kind);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPosts((current) =>
      current.map((item) =>
        item.id === id ? { ...item, reaction_counts: result.data.reaction_counts, my_reactions: result.data.my_reactions } : item
      )
    );
    if (detail?.id === id) {
      setDetail({ ...detail, reaction_counts: result.data.reaction_counts, my_reactions: result.data.my_reactions });
    }
    emitNotificationsChanged();
  };

  const toggleCommentReaction = async (id: string, kind: ForumReactionKind) => {
    const result = await ForumApi.reactComment(id, kind);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setComments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, reaction_counts: result.data.reaction_counts, my_reactions: result.data.my_reactions } : item
      )
    );
    emitNotificationsChanged();
  };

  const moderate = async (id: string, body: { pinned?: boolean; locked?: boolean }) => {
    const result = await ForumApi.update(id, body);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMenuId(null);
    await loadPosts();
    if (postId === id) await loadDetail(id);
    emitNotificationsChanged();
  };

  const submitReply = async () => {
    if (!detail || !stripHtml(reply)) return;
    if (detail.locked && !canModerate) return;
    setPosting(true);
    const result = await ForumApi.addComment(detail.id, { body: reply, parent_id: replyParent });
    if (!result.ok) {
      setPosting(false);
      setError(result.message);
      return;
    }
    try {
      await uploadPending('comments', result.data.comment.id, replyFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload attachments.');
    }
    setReply('');
    setReplyParent(undefined);
    setReplyFiles([]);
    setPosting(false);
    await loadDetail(detail.id);
    await loadPosts();
    emitNotificationsChanged();
  };

  const saveCommentEdit = async () => {
    if (!editCommentId || !stripHtml(editCommentBody)) return;
    const result = await ForumApi.updateComment(editCommentId, editCommentBody);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditCommentId(null);
    setEditCommentBody('');
    if (postId) await loadDetail(postId);
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    const result =
      confirmDelete.type === 'post' ? await ForumApi.remove(confirmDelete.id) : await ForumApi.removeComment(confirmDelete.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirmDelete(null);
    if (confirmDelete.type === 'post') {
      setPostUrl();
      await loadPosts();
    } else if (postId) {
      await loadDetail(postId);
      await loadPosts();
    }
  };

  const likeCount = (post: ForumPostSummary) => post.reaction_counts.LIKE || 0;

  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[280px_1fr]">
      <aside className={`rounded-xl border border-slate-800 bg-slate-900 p-3 ${postId ? 'hidden lg:block' : ''}`}>
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-950 p-1 text-[11px]">
          {(['direct', 'group', 'forum'] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => onSwitchTab(item)}
              className={`flex-1 rounded-md px-2 py-1.5 font-semibold capitalize ${
                item === 'forum' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item === 'forum' ? 'Forum' : item === 'group' ? 'Groups' : isCeo ? 'CEO Chat' : 'Direct'}
            </button>
          ))}
        </div>
        <div className="mb-2 flex gap-1 rounded-lg bg-slate-950 p-1 text-[11px]">
          <button
            type="button"
            onClick={() => setForumUrl()}
            className={`flex-1 rounded-md px-2 py-1.5 font-semibold ${
              !liveView ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Threads
          </button>
          <button
            type="button"
            onClick={() => setForumUrl({ live: true })}
            className={`flex-1 rounded-md px-2 py-1.5 font-semibold ${
              liveView ? 'bg-emerald-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Chat
          </button>
        </div>
        <div className="mb-2 rounded-md border border-emerald-900/70 bg-emerald-950/30 px-2 py-1.5 text-[11px] font-semibold text-emerald-300">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {activeCount} {activeCount === 1 ? 'user' : 'users'} active in Project Hub
        </div>
        {!liveView && (
          <>
          <button
          type="button"
          onClick={() => {
            setEditing(null);
            setComposerOpen(true);
          }}
          className="mb-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-cyan-600 px-2 py-1.5 text-[11px] font-bold text-white lg:hidden"
        >
          <Plus className="h-3 w-3" /> New Thread
        </button>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Threads</div>
        <div className="max-h-[58vh] space-y-1 overflow-y-auto">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => openPost(item.id)}
              className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                item.id === postId ? 'bg-cyan-950/60 text-cyan-200' : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate font-semibold">
                {item.pinned && <Pin className="h-3 w-3 shrink-0 text-amber-300" />}
                {item.locked && <Lock className="h-3 w-3 shrink-0 text-slate-400" />}
                <span className="truncate">{item.title}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {forumThreadKindLabel(item.thread_kind)} · {item.comment_count} {item.comment_count === 1 ? 'reply' : 'replies'}
              </div>
              <div className="truncate text-[10px] text-slate-600">
                {item.last_reply_author
                  ? `Last reply ${item.last_reply_author} · ${formatForumDate(item.last_reply_at || item.updated_at)}`
                  : `Started by ${item.author_name}`}
              </div>
            </button>
          ))}
        </div>
          </>
        )}
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-xl border border-slate-800 bg-slate-900">
        {liveView ? (
          <ForumLiveChat currentUser={currentUser} onOpenDirect={onOpenDirect} />
        ) : (
          <>
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void loadPosts();
                if (postId) void loadDetail(postId);
              }}
              className="font-bold text-cyan-300"
            >
              Retry
            </button>
          </div>
        )}

        {!postId && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  <MessagesSquare className="h-4 w-4" /> Forum threads
                </div>
                <p className="mt-1 max-w-xl text-xs text-slate-400">
                  Organized threads for messages, questions and ideas. Use Live Chat for people who are online right now.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-emerald-900 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {activeCount} active
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setComposerOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  <Plus className="h-3 w-3" /> New Thread
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setThreadKind('')}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  !threadKind ? 'border-cyan-700 bg-cyan-950/70 text-cyan-200' : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All threads
              </button>
              {FORUM_THREAD_KIND_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setThreadKind(item.value)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    threadKind === item.value ? 'border-cyan-700 bg-cyan-950/70 text-cyan-200' : 'border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}s
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_140px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search threads..."
                  className="w-full rounded-md border border-slate-800 bg-slate-950 py-2 pl-8 pr-3 text-xs text-slate-200"
                />
              </div>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-200"
              >
                <option value="">Category</option>
                {FORUM_CATEGORY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-200"
              >
                <option value="">Tags</option>
                {tagOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {loading && (
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60" />
                ))}
              </div>
            )}

            {!loading && visible.length === 0 && posts.length === 0 && (
              <div className="mt-10 flex flex-col items-center justify-center px-4 py-10 text-center">
                <MessageCircle className="h-10 w-10 text-cyan-400" />
                <h2 className="mt-3 text-sm font-bold text-slate-100">No threads yet</h2>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Start a discussion, ask a question, or share an idea. Teammates can reply whenever they are free — this is not live chat.
                </p>
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="mt-4 inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white"
                >
                  <Plus className="h-3 w-3" /> Start the first thread
                </button>
              </div>
            )}

            {!loading && visible.length === 0 && posts.length > 0 && (
              <div className="mt-10 text-center text-xs text-slate-400">No threads match this search or filter.</div>
            )}

            {!loading && pinned.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">📌 Pinned threads</div>
                <div className="space-y-3">{pinned.map((item) => renderCard(item))}</div>
              </div>
            )}
            {!loading && recent.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recent threads</div>
                <div className="space-y-3">{recent.map((item) => renderCard(item))}</div>
              </div>
            )}
          </div>
        )}

        {postId && (
          <div className="flex-1 overflow-y-auto p-4">
            <button type="button" onClick={() => setPostUrl()} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to threads
            </button>
            {detailLoading && !detail && <div className="mt-4 h-48 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60" />}
            {detail && (
              <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">{detail.title}</h2>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-950 text-[10px] font-bold text-cyan-200">
                        {initials(detail.author_name)}
                      </span>
                      <span>
                        {detail.author_name} · {detail.author_role}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{formatForumDateLong(detail.created_at)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ThreadKindBadge kind={detail.thread_kind} />
                      <span className="inline-flex rounded-full border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                        {forumCategoryLabel(detail.category)}
                      </span>
                    </div>
                    {detail.locked && <div className="mt-2 text-[11px] font-bold text-amber-300">🔒 Thread locked</div>}
                    <p className="mt-2 text-[11px] text-slate-500">
                      {detail.participant_count} {detail.participant_count === 1 ? 'person' : 'people'} in this thread · reply anytime
                    </p>
                  </div>
                  {(detail.author_id === currentUser.id || canModerate) && (
                    <div className="relative">
                      <button type="button" onClick={() => setMenuId(menuId === detail.id ? null : detail.id)} className="rounded p-1 text-slate-400 hover:bg-slate-800" aria-label="Post menu">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuId === detail.id && renderMenu(detail)}
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Original post</div>
                  <div
                    className="forum-body mt-3 text-sm leading-relaxed text-slate-200 [&_a]:text-cyan-400 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: detail.body }}
                  />
                {detail.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {detail.tags.map((item) => (
                      <span key={item} className="rounded-full border border-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                        #{item}
                      </span>
                    ))}
                  </div>
                )}
                {detail.attachments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Attachments</div>
                    {detail.attachments.map((doc) => (
                      <FilePreview key={doc.id} doc={doc} />
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <ReactionBar counts={detail.reaction_counts} mine={detail.my_reactions} onToggle={(kind) => void togglePostReaction(detail.id, kind)} />
                </div>
                </div>
                <div className="mt-6 text-xs font-bold text-slate-200">Replies in this thread ({comments.length})</div>
                <p className="mt-1 text-[11px] text-slate-500">Unlike live chat, replies stay in this thread so anyone can join later.</p>
                {detailLoading && comments.length === 0 && <div className="mt-2 h-16 animate-pulse rounded-lg bg-slate-950/60" />}
                {comments.length === 0 && !detailLoading && (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-400">
                    No replies yet. Add your thoughts whenever you can.
                  </div>
                )}
                <div className="mt-3 space-y-3">
                  {comments
                    .filter((item) => !item.parent_id)
                    .map((item) => (
                      <CommentCard
                        key={item.id}
                        item={item}
                        replies={comments.filter((row) => row.parent_id === item.id)}
                        currentUser={currentUser}
                        canModerate={canModerate}
                        locked={detail.locked}
                        editCommentId={editCommentId}
                        editCommentBody={editCommentBody}
                        onEditBody={setEditCommentBody}
                        onStartEdit={(comment) => {
                          setEditCommentId(comment.id);
                          setEditCommentBody(comment.body);
                        }}
                        onSaveEdit={() => void saveCommentEdit()}
                        onCancelEdit={() => setEditCommentId(null)}
                        onDelete={(comment) => setConfirmDelete({ type: 'comment', id: comment.id, title: 'this comment' })}
                        onReply={(id) => setReplyParent(id)}
                        onReact={(id, kind) => void toggleCommentReaction(id, kind)}
                      />
                    ))}
                </div>
                {detail.locked && !canModerate ? (
                  <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">🔒 Thread locked — new replies are paused</div>
                ) : (
                  <div className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    {replyParent && (
                      <div className="flex items-center justify-between text-[11px] text-cyan-300">
                        Replying to a comment in this thread
                        <button type="button" onClick={() => setReplyParent(undefined)} className="text-slate-400">
                          Cancel
                        </button>
                      </div>
                    )}
                    <div className="text-[11px] font-semibold text-slate-400">Add a reply — you can respond anytime</div>
                    <ForumRichEditor value={reply} onChange={setReply} placeholder="Share an answer, idea or follow-up..." minHeight={90} />
                    <DropZone compact onFiles={(files) => queueFiles(files, setReplyFiles)} />
                    <PendingList files={replyFiles} onRemove={(key) => setReplyFiles((current) => current.filter((item) => item.key !== key))} />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={posting || !stripHtml(reply)}
                        onClick={() => void submitReply()}
                        className="rounded-md bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        {posting ? 'Posting reply…' : 'Post reply'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
          </>
        )}
      </section>

      {composerOpen && (
        <ComposerModal
          editing={editing}
          onClose={() => {
            setComposerOpen(false);
            setEditing(null);
          }}
          onSaved={async (id) => {
            setComposerOpen(false);
            setEditing(null);
            await loadPosts();
            emitNotificationsChanged();
            setPostUrl(id);
          }}
          queueFiles={queueFiles}
          uploadPending={uploadPending}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-rose-900 bg-slate-900 p-4 text-xs">
            <h3 className="text-sm font-bold text-rose-200">Delete {confirmDelete.type === 'post' ? 'this thread' : 'this reply'}?</h3>
            <p className="mt-2 text-slate-400">This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-slate-700 px-3 py-1.5">
                Cancel
              </button>
              <button type="button" onClick={() => void runDelete()} className="rounded bg-rose-600 px-3 py-1.5 font-bold text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderMenu(item: ForumPostSummary) {
    const owner = item.author_id === currentUser.id;
    return (
      <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-800 bg-slate-950 py-1 shadow-xl">
        {(owner || canModerate) && (
          <button
            type="button"
            onClick={() => {
              setEditing(item);
              setComposerOpen(true);
              setMenuId(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800"
          >
            Edit
          </button>
        )}
        {(owner || canModerate) && (
          <button
            type="button"
            onClick={() => {
              setConfirmDelete({ type: 'post', id: item.id, title: item.title });
              setMenuId(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-rose-300 hover:bg-rose-950"
          >
            Delete
          </button>
        )}
        {canModerate && (
          <>
            <button type="button" onClick={() => void moderate(item.id, { pinned: !item.pinned })} className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
              {item.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" onClick={() => void moderate(item.id, { locked: !item.locked })} className="block w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
              {item.locked ? 'Unlock' : 'Lock'}
            </button>
          </>
        )}
      </div>
    );
  }

  function renderCard(item: ForumPostSummary) {
    const unanswered = forumThreadKind(item.thread_kind) === 'QUESTION' && item.comment_count === 0;
    return (
      <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => openPost(item.id)} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <ThreadKindBadge kind={item.thread_kind} />
              {unanswered && (
                <span className="rounded-full border border-sky-900 px-2 py-0.5 text-[10px] font-semibold text-sky-300">Waiting for replies</span>
              )}
              {item.locked && <span className="text-[10px] font-semibold text-amber-300">Locked</span>}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-950 text-[10px] font-bold text-cyan-200">
                  {initials(item.author_name)}
                </span>
                {item.author_name} · {item.author_role}
              </span>
              <span>{formatForumDate(item.created_at)}</span>
            </div>
            <h3 className="mt-2 text-sm font-bold text-slate-100">{item.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.body_text}</p>
            {item.attachment_count > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {item.attachment_types.slice(0, 4).map((type) => (
                  <span key={type} className="inline-flex items-center gap-1 rounded border border-slate-800 px-1.5 py-0.5">
                    <AttachmentGlyph name={type === 'Excel' ? 'file.xlsx' : type === 'PDF' ? 'file.pdf' : type === 'Image' ? 'file.png' : type === 'PowerPoint' ? 'file.pptx' : 'file.docx'} />
                    {type}
                  </span>
                ))}
                {item.attachment_count > item.attachment_types.length && <span>{item.attachment_count} Attachments</span>}
                {item.attachment_types.length === 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3 w-3" /> {item.attachment_count} Attachments
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-500">
              {item.last_reply_author
                ? `Last reply by ${item.last_reply_author} · ${formatForumDate(item.last_reply_at || item.updated_at)}`
                : 'No replies yet — you can reply anytime'}
            </div>
          </button>
          {(item.author_id === currentUser.id || canModerate) && (
            <div className="relative">
              <button type="button" onClick={() => setMenuId(menuId === item.id ? null : item.id)} className="rounded p-1 text-slate-400 hover:bg-slate-800" aria-label="Thread menu">
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuId === item.id && renderMenu(item)}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <button type="button" onClick={() => void togglePostReaction(item.id, 'LIKE')} className="hover:text-slate-200">
              👍 {likeCount(item)}
            </button>
            <button type="button" onClick={() => openPost(item.id)}>
              💬 {item.comment_count} {item.comment_count === 1 ? 'reply' : 'replies'}
            </button>
            <span>{item.participant_count || 1} in thread</span>
          </div>
          {item.pinned && <Pin className="h-3.5 w-3.5 text-amber-300" />}
        </div>
      </article>
    );
  }
}

function CommentCard({
  item,
  replies,
  currentUser,
  canModerate,
  locked,
  editCommentId,
  editCommentBody,
  onEditBody,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  onReact,
}: {
  item: ForumCommentView;
  replies: ForumCommentView[];
  currentUser: User;
  canModerate: boolean;
  locked: boolean;
  editCommentId: string | null;
  editCommentBody: string;
  onEditBody: (value: string) => void;
  onStartEdit: (comment: ForumCommentView) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (comment: ForumCommentView) => void;
  onReply: (id: string) => void;
  onReact: (id: string, kind: ForumReactionKind) => void;
}) {
  const canEdit = item.author_id === currentUser.id || canModerate;
  const canReply = !locked || canModerate;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-200">
          {initials(item.author_name)}
        </span>
        {item.author_name}
        <span className="text-slate-600">· {formatForumDate(item.created_at)}</span>
      </div>
      {editCommentId === item.id ? (
        <div className="mt-2 space-y-2">
          <ForumRichEditor value={editCommentBody} onChange={onEditBody} minHeight={80} />
          <div className="flex gap-2">
            <button type="button" onClick={onSaveEdit} className="rounded bg-cyan-600 px-2 py-1 text-[11px] font-bold text-white">
              Save
            </button>
            <button type="button" onClick={onCancelEdit} className="rounded border border-slate-700 px-2 py-1 text-[11px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="forum-body mt-2 text-xs text-slate-200 [&_a]:text-cyan-400 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: item.body }} />
      )}
      {item.attachments.length > 0 && (
        <div className="mt-2 space-y-2">
          {item.attachments.map((doc) => (
            <FilePreview key={doc.id} doc={doc} />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <ReactionBar compact counts={item.reaction_counts} mine={item.my_reactions} onToggle={(kind) => onReact(item.id, kind)} />
        {canReply && (
          <button type="button" onClick={() => onReply(item.id)} className="font-semibold text-cyan-400">
            Reply
          </button>
        )}
        {canEdit && (
          <>
            <button type="button" onClick={() => onStartEdit(item)}>
              Edit
            </button>
            <button type="button" onClick={() => onDelete(item)} className="text-rose-300">
              Delete
            </button>
          </>
        )}
      </div>
      {replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l border-slate-800 pl-3">
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              item={reply}
              replies={[]}
              currentUser={currentUser}
              canModerate={canModerate}
              locked={locked}
              editCommentId={editCommentId}
              editCommentBody={editCommentBody}
              onEditBody={onEditBody}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onReply={onReply}
              onReact={onReact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ComposerModal({
  editing,
  onClose,
  onSaved,
  queueFiles,
  uploadPending,
}: {
  editing: ForumPostSummary | null;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  queueFiles: (files: File[], setter: React.Dispatch<React.SetStateAction<PendingFile[]>>) => void;
  uploadPending: (target: 'posts' | 'comments', id: string, files: PendingFile[]) => Promise<void>;
}) {
  const [title, setTitle] = useState(editing?.title || '');
  const [threadKind, setThreadKind] = useState<ForumThreadKind>(forumThreadKind(editing?.thread_kind));
  const [category, setCategory] = useState<ForumCategory>(editing?.category || 'GENERAL');
  const [body, setBody] = useState(editing?.body || '');
  const [tagInput, setTagInput] = useState(editing?.tags.join(', ') || '');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    void ForumApi.get(editing.id).then((result) => {
      if (result.ok) setBody(result.data.post.body);
    });
  }, [editing]);

  const publish = async () => {
    if (!title.trim() || !stripHtml(body)) {
      setError('Title, category and message are required.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: title.trim(),
      body,
      category,
      thread_kind: threadKind,
      tags: tagInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
    const result = editing ? await ForumApi.update(editing.id, payload) : await ForumApi.create(payload);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    try {
      await uploadPending('posts', result.data.post.id, files);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not upload attachments.');
      return;
    }
    setBusy(false);
    await onSaved(result.data.post.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[96vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-slate-800 bg-slate-900 p-4 text-xs sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">{editing ? 'Edit thread' : 'Start a thread'}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">This is not live chat. Teammates can reply whenever they are free.</p>
        <label className="mt-3 block text-[11px] font-semibold text-slate-400">What are you posting? *</label>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {FORUM_THREAD_KIND_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setThreadKind(item.value)}
              className={`rounded-lg border px-2 py-2 text-left ${
                threadKind === item.value ? 'border-cyan-700 bg-cyan-950/50 text-cyan-100' : 'border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="font-bold">{item.label}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">{item.hint}</div>
            </button>
          ))}
        </div>
        <label className="mt-3 block text-[11px] font-semibold text-slate-400">Thread title *</label>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give the thread a clear topic" className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
        <label className="mt-3 block text-[11px] font-semibold text-slate-400">Category *</label>
        <select value={category} onChange={(event) => setCategory(event.target.value as ForumCategory)} className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
          {FORUM_CATEGORY_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-[11px] font-semibold text-slate-400">Message *</label>
        <div className="mt-1">
          <ForumRichEditor value={body} onChange={setBody} placeholder="Write the first message in this thread..." />
        </div>
        <label className="mt-3 block text-[11px] font-semibold text-slate-400">Tags</label>
        <input
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          placeholder="ui, review, rackvision"
          className="mt-1 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
        />
        <label className="mt-3 block text-[11px] font-semibold text-slate-400">Attachments</label>
        <div className="mt-1">
          <DropZone onFiles={(incoming) => queueFiles(incoming, setFiles)} />
        </div>
        <PendingList files={files} onRemove={(key) => setFiles((current) => current.filter((item) => item.key !== key))} />
        {error && <div className="mt-3 rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-700 px-3 py-1.5">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void publish()} className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">
            {busy ? 'Publishing…' : editing ? 'Save thread' : 'Publish thread'}
          </button>
        </div>
      </div>
    </div>
  );
}
