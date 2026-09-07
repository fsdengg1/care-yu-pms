import { NotificationItem } from './types';
import { leadDetailHref } from './leadRoutes';

function conversationTab(item: NotificationItem) {
  if (item.type === 'ANNOUNCEMENT') return 'forum';
  if (item.type === 'GROUP_MESSAGE') return 'group';
  return 'direct';
}

export function notificationHref(item: NotificationItem) {
  if (item.action_url) return item.action_url;
  if (
    item.type === 'FORUM_POST' ||
    item.type === 'FORUM_REPLY' ||
    item.type === 'FORUM_MENTION' ||
    item.type === 'FORUM_REACTION' ||
    item.type === 'FORUM_PINNED'
  ) {
    if (item.entity_id === 'live') return '/messages?tab=forum&view=live';
    return `/messages?tab=forum&post=${encodeURIComponent(item.entity_id)}`;
  }
  if (item.type === 'DIRECT_MESSAGE' || item.type === 'CHAT_MESSAGE' || item.type === 'GROUP_MESSAGE' || item.type === 'ANNOUNCEMENT') {
    const tab = conversationTab(item);
    return `/messages?tab=${tab}&conversation=${encodeURIComponent(item.entity_id)}&c=${encodeURIComponent(item.entity_id)}`;
  }
  if (item.type === 'STAGE_COMPLETED') {
    return item.entity_type === 'PROJECT' ? `/projects/${item.entity_id}` : leadDetailHref(item.entity_id);
  }
  if (item.type === 'TASK_ASSIGNED' || item.type === 'TASK_FORWARDED' || item.type === 'ACTION_REQUIRED' || item.type === 'APPROVAL_REQUIRED') {
    if (item.entity_type === 'TASK') return `/my-work?task=${encodeURIComponent(item.entity_id)}`;
  }
  if (item.entity_type === 'LEAD') return leadDetailHref(item.entity_id);
  if (item.entity_type === 'PROJECT') return `/projects/${item.entity_id}`;
  if (item.entity_type === 'DAILY_UPDATE') return `/daily-updates/${item.entity_id}`;
  if (item.entity_type === 'ESCALATION') return `/dashboard/ceo/escalations/${item.entity_id}`;
  if (item.entity_type === 'TASK') return `/my-work?task=${encodeURIComponent(item.entity_id)}`;
  return '/notifications';
}
